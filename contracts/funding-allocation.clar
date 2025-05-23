;; Funding Allocation Contract
;; Manages distribution of restoration resources

(define-data-var contract-version uint u1)

;; Funding pool data structure
(define-map funding-pools
  { pool-id: uint }
  {
    name: (string-utf8 100),
    description: (string-utf8 500),
    total-funds: uint,
    remaining-funds: uint,
    admin: principal,
    active: bool
  }
)

;; Track the next pool ID
(define-data-var next-pool-id uint u1)

;; Funding allocations to projects
(define-map allocations
  { pool-id: uint, project-id: uint, allocation-id: uint }
  {
    amount: uint,
    release-condition: (string-utf8 200),
    status: uint, ;; 0=pending, 1=released, 2=cancelled
    allocation-date: uint,
    release-date: uint,
    allocator: principal
  }
)

;; Track the next allocation ID for each pool-project pair
(define-map allocation-count
  { pool-id: uint, project-id: uint }
  { count: uint }
)

;; Authorized allocators who can distribute funds
(define-map allocators
  { address: principal }
  { active: bool }
)

;; Initialize contract owner
(define-constant contract-owner tx-sender)

;; Error codes
(define-constant err-not-authorized (err u100))
(define-constant err-pool-not-found (err u101))
(define-constant err-insufficient-funds (err u102))
(define-constant err-allocation-not-found (err u103))
(define-constant err-already-released (err u104))

;; Add an allocator
(define-public (add-allocator (allocator principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-not-authorized)
    (ok (map-set allocators { address: allocator } { active: true }))
  )
)

;; Remove an allocator
(define-public (remove-allocator (allocator principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-not-authorized)
    (ok (map-set allocators { address: allocator } { active: false }))
  )
)

;; Create a new funding pool
(define-public (create-funding-pool
    (name (string-utf8 100))
    (description (string-utf8 500))
    (initial-funds uint))
  (let
    ((pool-id (var-get next-pool-id)))

    ;; Create the funding pool
    (map-set funding-pools
      { pool-id: pool-id }
      {
        name: name,
        description: description,
        total-funds: initial-funds,
        remaining-funds: initial-funds,
        admin: tx-sender,
        active: true
      }
    )

    ;; Increment the pool ID counter
    (var-set next-pool-id (+ pool-id u1))

    (ok pool-id)
  )
)

;; Add funds to an existing pool
(define-public (add-funds-to-pool (pool-id uint) (amount uint))
  (let
    ((pool (unwrap! (map-get? funding-pools { pool-id: pool-id }) err-pool-not-found)))

    ;; Check if caller is the pool admin
    (asserts! (is-eq (get admin pool) tx-sender) err-not-authorized)

    ;; Update the pool with additional funds
    (map-set funding-pools
      { pool-id: pool-id }
      (merge pool {
        total-funds: (+ (get total-funds pool) amount),
        remaining-funds: (+ (get remaining-funds pool) amount)
      })
    )

    (ok true)
  )
)

;; Allocate funds from a pool to a project
(define-public (allocate-funds
    (pool-id uint)
    (project-id uint)
    (amount uint)
    (release-condition (string-utf8 200)))
  (let
    ((pool (unwrap! (map-get? funding-pools { pool-id: pool-id }) err-pool-not-found))
     (is-allocator (default-to { active: false } (map-get? allocators { address: tx-sender })))
     (allocation-counter (default-to { count: u0 } (map-get? allocation-count { pool-id: pool-id, project-id: project-id })))
     (allocation-id (get count allocation-counter)))

    ;; Check if caller is an authorized allocator
    (asserts! (get active is-allocator) err-not-authorized)

    ;; Check if pool has sufficient funds
    (asserts! (>= (get remaining-funds pool) amount) err-insufficient-funds)

    ;; Create the allocation
    (map-set allocations
      { pool-id: pool-id, project-id: project-id, allocation-id: allocation-id }
      {
        amount: amount,
        release-condition: release-condition,
        status: u0, ;; pending
        allocation-date: block-height,
        release-date: u0,
        allocator: tx-sender
      }
    )

    ;; Update the pool's remaining funds
    (map-set funding-pools
      { pool-id: pool-id }
      (merge pool {
        remaining-funds: (- (get remaining-funds pool) amount)
      })
    )

    ;; Increment the allocation counter
    (map-set allocation-count
      { pool-id: pool-id, project-id: project-id }
      { count: (+ allocation-id u1) }
    )

    (ok allocation-id)
  )
)

;; Release allocated funds to a project
(define-public (release-funds
    (pool-id uint)
    (project-id uint)
    (allocation-id uint))
  (let
    ((allocation (unwrap! (map-get? allocations
                          { pool-id: pool-id, project-id: project-id, allocation-id: allocation-id })
                          err-allocation-not-found))
     (pool (unwrap! (map-get? funding-pools { pool-id: pool-id }) err-pool-not-found)))

    ;; Check if caller is the pool admin
    (asserts! (is-eq (get admin pool) tx-sender) err-not-authorized)

    ;; Check if allocation is still pending
    (asserts! (is-eq (get status allocation) u0) err-already-released)

    ;; Update the allocation status
    (map-set allocations
      { pool-id: pool-id, project-id: project-id, allocation-id: allocation-id }
      (merge allocation {
        status: u1, ;; released
        release-date: block-height
      })
    )

    (ok true)
  )
)

;; Cancel an allocation and return funds to the pool
(define-public (cancel-allocation
    (pool-id uint)
    (project-id uint)
    (allocation-id uint))
  (let
    ((allocation (unwrap! (map-get? allocations
                          { pool-id: pool-id, project-id: project-id, allocation-id: allocation-id })
                          err-allocation-not-found))
     (pool (unwrap! (map-get? funding-pools { pool-id: pool-id }) err-pool-not-found)))

    ;; Check if caller is the pool admin
    (asserts! (is-eq (get admin pool) tx-sender) err-not-authorized)

    ;; Check if allocation is still pending
    (asserts! (is-eq (get status allocation) u0) err-already-released)

    ;; Update the allocation status
    (map-set allocations
      { pool-id: pool-id, project-id: project-id, allocation-id: allocation-id }
      (merge allocation {
        status: u2, ;; cancelled
        release-date: block-height
      })
    )

    ;; Return funds to the pool
    (map-set funding-pools
      { pool-id: pool-id }
      (merge pool {
        remaining-funds: (+ (get remaining-funds pool) (get amount allocation))
      })
    )

    (ok true)
  )
)

;; Read-only function to get funding pool details
(define-read-only (get-funding-pool (pool-id uint))
  (map-get? funding-pools { pool-id: pool-id })
)

;; Read-only function to get allocation details
(define-read-only (get-allocation (pool-id uint) (project-id uint) (allocation-id uint))
  (map-get? allocations { pool-id: pool-id, project-id: project-id, allocation-id: allocation-id })
)

;; Read-only function to get allocation count
(define-read-only (get-allocation-count (pool-id uint) (project-id uint))
  (default-to { count: u0 } (map-get? allocation-count { pool-id: pool-id, project-id: project-id }))
)

;; Read-only function to check if an address is an allocator
(define-read-only (is-allocator (address principal))
  (default-to false (get active (map-get? allocators { address: address })))
)

;; Get contract version
(define-read-only (get-version)
  (var-get contract-version)
)
