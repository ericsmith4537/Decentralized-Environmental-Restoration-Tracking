;; Baseline Assessment Contract
;; Records pre-restoration conditions

(define-data-var contract-version uint u1)

;; Baseline assessment data structure
(define-map baseline-assessments
  { project-id: uint }
  {
    soil-quality: uint,
    biodiversity-index: uint,
    water-quality: uint,
    carbon-storage: uint,
    assessment-date: uint,
    assessor: principal,
    additional-data: (string-utf8 1000)
  }
)

;; Authorized assessors who can create baseline assessments
(define-map assessors
  { address: principal }
  { active: bool }
)

;; Initialize contract owner
(define-constant contract-owner tx-sender)

;; Error codes
(define-constant err-not-authorized (err u100))
(define-constant err-assessment-exists (err u101))
(define-constant err-invalid-project (err u102))

;; Add an assessor
(define-public (add-assessor (assessor principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-not-authorized)
    (ok (map-set assessors { address: assessor } { active: true }))
  )
)

;; Remove an assessor
(define-public (remove-assessor (assessor principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-not-authorized)
    (ok (map-set assessors { address: assessor } { active: false }))
  )
)

;; Create a baseline assessment for a project
(define-public (create-baseline-assessment
    (project-id uint)
    (soil-quality uint)
    (biodiversity-index uint)
    (water-quality uint)
    (carbon-storage uint)
    (additional-data (string-utf8 1000)))
  (let
    ((is-assessor (default-to { active: false } (map-get? assessors { address: tx-sender })))
     (existing-assessment (map-get? baseline-assessments { project-id: project-id })))

    ;; Check if caller is an authorized assessor
    (asserts! (get active is-assessor) err-not-authorized)

    ;; Check if assessment already exists
    (asserts! (is-none existing-assessment) err-assessment-exists)

    ;; Create the baseline assessment
    (map-set baseline-assessments
      { project-id: project-id }
      {
        soil-quality: soil-quality,
        biodiversity-index: biodiversity-index,
        water-quality: water-quality,
        carbon-storage: carbon-storage,
        assessment-date: block-height,
        assessor: tx-sender,
        additional-data: additional-data
      }
    )
    (ok true)
  )
)

;; Update an existing baseline assessment (only by original assessor)
(define-public (update-baseline-assessment
    (project-id uint)
    (soil-quality uint)
    (biodiversity-index uint)
    (water-quality uint)
    (carbon-storage uint)
    (additional-data (string-utf8 1000)))
  (let
    ((assessment (unwrap! (map-get? baseline-assessments { project-id: project-id }) err-invalid-project)))

    ;; Check if caller is the original assessor
    (asserts! (is-eq (get assessor assessment) tx-sender) err-not-authorized)

    ;; Update the assessment
    (map-set baseline-assessments
      { project-id: project-id }
      {
        soil-quality: soil-quality,
        biodiversity-index: biodiversity-index,
        water-quality: water-quality,
        carbon-storage: carbon-storage,
        assessment-date: block-height,
        assessor: tx-sender,
        additional-data: additional-data
      }
    )
    (ok true)
  )
)

;; Read-only function to get baseline assessment
(define-read-only (get-baseline-assessment (project-id uint))
  (map-get? baseline-assessments { project-id: project-id })
)

;; Read-only function to check if an address is an assessor
(define-read-only (is-assessor (address principal))
  (default-to false (get active (map-get? assessors { address: address })))
)

;; Get contract version
(define-read-only (get-version)
  (var-get contract-version)
)
