import { describe, it, expect, beforeEach } from "vitest"

// Mock the Clarity VM environment
const mockClarity = {
  contracts: {},
  txSender: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  blockHeight: 100,
}

// Mock implementation of the funding-allocation contract
const setupFundingAllocationContract = () => {
  const allocators = new Map()
  const fundingPools = new Map()
  const allocations = new Map()
  const allocationCount = new Map()
  let nextPoolId = 1
  
  return {
    addAllocator: (allocator) => {
      if (mockClarity.txSender !== mockClarity.contracts.fundingAllocation.contractOwner) {
        return { type: "err", value: 100 } // err-not-authorized
      }
      allocators.set(allocator, { active: true })
      return { type: "ok", value: true }
    },
    
    removeAllocator: (allocator) => {
      if (mockClarity.txSender !== mockClarity.contracts.fundingAllocation.contractOwner) {
        return { type: "err", value: 100 } // err-not-authorized
      }
      allocators.set(allocator, { active: false })
      return { type: "ok", value: true }
    },
    
    createFundingPool: (name, description, initialFunds) => {
      const poolId = nextPoolId
      
      fundingPools.set(poolId, {
        name,
        description,
        totalFunds: initialFunds,
        remainingFunds: initialFunds,
        admin: mockClarity.txSender,
        active: true,
      })
      
      nextPoolId++
      
      return { type: "ok", value: poolId }
    },
    
    addFundsToPool: (poolId, amount) => {
      const pool = fundingPools.get(poolId)
      if (!pool) {
        return { type: "err", value: 101 } // err-pool-not-found
      }
      
      if (pool.admin !== mockClarity.txSender) {
        return { type: "err", value: 100 } // err-not-authorized
      }
      
      pool.totalFunds += amount
      pool.remainingFunds += amount
      fundingPools.set(poolId, pool)
      
      return { type: "ok", value: true }
    },
    
    allocateFunds: (poolId, projectId, amount, releaseCondition) => {
      const pool = fundingPools.get(poolId)
      if (!pool) {
        return { type: "err", value: 101 } // err-pool-not-found
      }
      
      const allocator = allocators.get(mockClarity.txSender)
      if (!allocator || !allocator.active) {
        return { type: "err", value: 100 } // err-not-authorized
      }
      
      if (pool.remainingFunds < amount) {
        return { type: "err", value: 102 } // err-insufficient-funds
      }
      
      const key = `${poolId}-${projectId}`
      const count = allocationCount.get(key) || 0
      const allocationId = count
      
      const allocationKey = `${poolId}-${projectId}-${allocationId}`
      allocations.set(allocationKey, {
        amount,
        releaseCondition,
        status: 0, // pending
        allocationDate: mockClarity.blockHeight,
        releaseDate: 0,
        allocator: mockClarity.txSender,
      })
      
      // Update pool's remaining funds
      pool.remainingFunds -= amount
      fundingPools.set(poolId, pool)
      
      // Increment allocation count
      allocationCount.set(key, count + 1)
      
      return { type: "ok", value: allocationId }
    },
    
    releaseFunds: (poolId, projectId, allocationId) => {
      const pool = fundingPools.get(poolId)
      if (!pool) {
        return { type: "err", value: 101 } // err-pool-not-found
      }
      
      if (pool.admin !== mockClarity.txSender) {
        return { type: "err", value: 100 } // err-not-authorized
      }
      
      const allocationKey = `${poolId}-${projectId}-${allocationId}`
      const allocation = allocations.get(allocationKey)
      if (!allocation) {
        return { type: "err", value: 103 } // err-allocation-not-found
      }
      
      if (allocation.status !== 0) {
        return { type: "err", value: 104 } // err-already-released
      }
      
      allocation.status = 1 // released
      allocation.releaseDate = mockClarity.blockHeight
      allocations.set(allocationKey, allocation)
      
      return { type: "ok", value: true }
    },
    
    cancelAllocation: (poolId, projectId, allocationId) => {
      const pool = fundingPools.get(poolId)
      if (!pool) {
        return { type: "err", value: 101 } // err-pool-not-found
      }
      
      if (pool.admin !== mockClarity.txSender) {
        return { type: "err", value: 100 } // err-not-authorized
      }
      
      const allocationKey = `${poolId}-${projectId}-${allocationId}`
      const allocation = allocations.get(allocationKey)
      if (!allocation) {
        return { type: "err", value: 103 } // err-allocation-not-found
      }
      
      if (allocation.status !== 0) {
        return { type: "err", value: 104 } // err-already-released
      }
      
      allocation.status = 2 // cancelled
      allocation.releaseDate = mockClarity.blockHeight
      allocations.set(allocationKey, allocation)
      
      // Return funds to the pool
      pool.remainingFunds += allocation.amount
      fundingPools.set(poolId, pool)
      
      return { type: "ok", value: true }
    },
    
    getFundingPool: (poolId) => {
      return fundingPools.get(poolId) || null
    },
    
    getAllocation: (poolId, projectId, allocationId) => {
      const allocationKey = `${poolId}-${projectId}-${allocationId}`
      return allocations.get(allocationKey) || null
    },
    
    getAllocationCount: (poolId, projectId) => {
      const key = `${poolId}-${projectId}`
      return { count: allocationCount.get(key) || 0 }
    },
    
    isAllocator: (address) => {
      const allocator = allocators.get(address)
      return allocator ? allocator.active : false
    },
    
    getVersion: () => 1,
    
    contractOwner: mockClarity.txSender,
  }
}

describe("Funding Allocation Contract", () => {
  beforeEach(() => {
    // Reset the mock Clarity environment
    mockClarity.contracts = {
      fundingAllocation: setupFundingAllocationContract(),
    }
  })
  
  it("should allow contract owner to add allocators", () => {
    const allocator = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    const result = mockClarity.contracts.fundingAllocation.addAllocator(allocator)
    expect(result.type).toBe("ok")
    expect(mockClarity.contracts.fundingAllocation.isAllocator(allocator)).toBe(true)
  })
  
  it("should not allow non-owner to add allocators", () => {
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    
    const allocator = "ST3CECAKJ4BH08JYY7W53MC81BYDT4YDA5Z7GZQZJ"
    const result = mockClarity.contracts.fundingAllocation.addAllocator(allocator)
    
    expect(result.type).toBe("err")
    expect(result.value).toBe(100) // err-not-authorized
    expect(mockClarity.contracts.fundingAllocation.isAllocator(allocator)).toBe(false)
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should allow creating funding pools", () => {
    const result = mockClarity.contracts.fundingAllocation.createFundingPool(
        "Reforestation Fund",
        "Funding for tree planting and forest restoration projects",
        100000,
    )
    
    expect(result.type).toBe("ok")
    expect(result.value).toBe(1) // First pool ID
    
    const pool = mockClarity.contracts.fundingAllocation.getFundingPool(1)
    expect(pool).not.toBeNull()
    expect(pool.name).toBe("Reforestation Fund")
    expect(pool.totalFunds).toBe(100000)
    expect(pool.remainingFunds).toBe(100000)
    expect(pool.admin).toBe(mockClarity.txSender)
    expect(pool.active).toBe(true)
  })
  
  it("should allow pool admin to add funds to a pool", () => {
    // Create a pool
    mockClarity.contracts.fundingAllocation.createFundingPool(
        "Reforestation Fund",
        "Funding for tree planting and forest restoration projects",
        100000,
    )
    
    // Add funds to the pool
    const result = mockClarity.contracts.fundingAllocation.addFundsToPool(1, 50000)
    expect(result.type).toBe("ok")
    
    // Check updated pool funds
    const pool = mockClarity.contracts.fundingAllocation.getFundingPool(1)
    expect(pool.totalFunds).toBe(150000)
    expect(pool.remainingFunds).toBe(150000)
  })
  
  it("should not allow non-admin to add funds to a pool", () => {
    // Create a pool
    mockClarity.contracts.fundingAllocation.createFundingPool(
        "Reforestation Fund",
        "Funding for tree planting and forest restoration projects",
        100000,
    )
    
    // Switch to non-admin
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    
    // Try to add funds to the pool
    const result = mockClarity.contracts.fundingAllocation.addFundsToPool(1, 50000)
    expect(result.type).toBe("err")
    expect(result.value).toBe(100) // err-not-authorized
    
    // Check that pool funds are unchanged
    const pool = mockClarity.contracts.fundingAllocation.getFundingPool(1)
    expect(pool.totalFunds).toBe(100000)
    expect(pool.remainingFunds).toBe(100000)
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should allow allocators to allocate funds from a pool", () => {
    // Create a pool
    mockClarity.contracts.fundingAllocation.createFundingPool(
        "Reforestation Fund",
        "Funding for tree planting and forest restoration projects",
        100000,
    )
    
    // Add an allocator
    const allocator = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    mockClarity.contracts.fundingAllocation.addAllocator(allocator)
    
    // Switch to allocator
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = allocator
    
    // Allocate funds
    const result = mockClarity.contracts.fundingAllocation.allocateFunds(
        1, // poolId
        1, // projectId
        30000, // amount
        "Complete planting of 5000 trees",
    )
    
    expect(result.type).toBe("ok")
    expect(result.value).toBe(0) // First allocation ID
    
    // Check allocation
    const allocation = mockClarity.contracts.fundingAllocation.getAllocation(1, 1, 0)
    expect(allocation).not.toBeNull()
    expect(allocation.amount).toBe(30000)
    expect(allocation.releaseCondition).toBe("Complete planting of 5000 trees")
    expect(allocation.status).toBe(0) // pending
    expect(allocation.allocator).toBe(allocator)
    
    // Check updated pool funds
    const pool = mockClarity.contracts.fundingAllocation.getFundingPool(1)
    expect(pool.remainingFunds).toBe(70000) // 100000 - 30000
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should not allow non-allocators to allocate funds", () => {
    // Create a pool
    mockClarity.contracts.fundingAllocation.createFundingPool(
        "Reforestation Fund",
        "Funding for tree planting and forest restoration projects",
        100000,
    )
    
    // Switch to non-allocator
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    
    // Try to allocate funds
    const result = mockClarity.contracts.fundingAllocation.allocateFunds(
        1, // poolId
        1, // projectId
        30000, // amount
        "Complete planting of 5000 trees",
    )
    
    expect(result.type).toBe("err")
    expect(result.value).toBe(100) // err-not-authorized
    
    // Check that pool funds are unchanged
    const pool = mockClarity.contracts.fundingAllocation.getFundingPool(1)
    expect(pool.remainingFunds).toBe(100000)
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should not allow allocating more funds than available in the pool", () => {
    // Create a pool
    mockClarity.contracts.fundingAllocation.createFundingPool(
        "Reforestation Fund",
        "Funding for tree planting and forest restoration projects",
        100000,
    )
    
    // Add an allocator
    const allocator = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    mockClarity.contracts.fundingAllocation.addAllocator(allocator)
    
    // Switch to allocator
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = allocator
    
    // Try to allocate more funds than available
    const result = mockClarity.contracts.fundingAllocation.allocateFunds(
        1, // poolId
        1, // projectId
        150000, // amount (more than the 100000 available)
        "Complete planting of 5000 trees",
    )
    
    expect(result.type).toBe("err")
    expect(result.value).toBe(102) // err-insufficient-funds
    
    // Check that pool funds are unchanged
    const pool = mockClarity.contracts.fundingAllocation.getFundingPool(1)
    expect(pool.remainingFunds).toBe(100000)
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should allow pool admin to release allocated funds", () => {
    // Create a pool
    mockClarity.contracts.fundingAllocation.createFundingPool(
        "Reforestation Fund",
        "Funding for tree planting and forest restoration projects",
        100000,
    )
    
    // Add an allocator
    const allocator = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    mockClarity.contracts.fundingAllocation.addAllocator(allocator)
    
    // Switch to allocator to allocate funds
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = allocator
    
    mockClarity.contracts.fundingAllocation.allocateFunds(
        1, // poolId
        1, // projectId
        30000, // amount
        "Complete planting of 5000 trees",
    )
    
    // Switch back to pool admin
    mockClarity.txSender = originalTxSender
    
    // Release the funds
    const result = mockClarity.contracts.fundingAllocation.releaseFunds(1, 1, 0)
    expect(result.type).toBe("ok")
    
    // Check updated allocation status
    const allocation = mockClarity.contracts.fundingAllocation.getAllocation(1, 1, 0)
    expect(allocation.status).toBe(1) // released
    expect(allocation.releaseDate).toBe(mockClarity.blockHeight)
  })
  
  it("should not allow non-admin to release allocated funds", () => {
    // Create a pool
    mockClarity.contracts.fundingAllocation.createFundingPool(
        "Reforestation Fund",
        "Funding for tree planting and forest restoration projects",
        100000,
    )
    
    // Add an allocator
    const allocator = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    mockClarity.contracts.fundingAllocation.addAllocator(allocator)
    
    // Switch to allocator to allocate funds
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = allocator
    
    mockClarity.contracts.fundingAllocation.allocateFunds(
        1, // poolId
        1, // projectId
        30000, // amount
        "Complete planting of 5000 trees",
    )
    
    // Try to release the funds as the allocator (not the admin)
    const result = mockClarity.contracts.fundingAllocation.releaseFunds(1, 1, 0)
    expect(result.type).toBe("err")
    expect(result.value).toBe(100) // err-not-authorized
    
    // Check that allocation status is unchanged
    const allocation = mockClarity.contracts.fundingAllocation.getAllocation(1, 1, 0)
    expect(allocation.status).toBe(0) // still pending
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should allow pool admin to cancel an allocation and return funds to the pool", () => {
    // Create a pool
    mockClarity.contracts.fundingAllocation.createFundingPool(
        "Reforestation Fund",
        "Funding for tree planting and forest restoration projects",
        100000,
    )
    
    // Add an allocator
    const allocator = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    mockClarity.contracts.fundingAllocation.addAllocator(allocator)
    
    // Switch to allocator to allocate funds
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = allocator
    
    mockClarity.contracts.fundingAllocation.allocateFunds(
        1, // poolId
        1, // projectId
        30000, // amount
        "Complete planting of 5000 trees",
    )
    
    // Check pool funds after allocation
    let pool = mockClarity.contracts.fundingAllocation.getFundingPool(1)
    expect(pool.remainingFunds).toBe(70000) // 100000 - 30000
    
    // Switch back to pool admin
    mockClarity.txSender = originalTxSender
    
    // Cancel the allocation
    const result = mockClarity.contracts.fundingAllocation.cancelAllocation(1, 1, 0)
    expect(result.type).toBe("ok")
    
    // Check updated allocation status
    const allocation = mockClarity.contracts.fundingAllocation.getAllocation(1, 1, 0)
    expect(allocation.status).toBe(2) // cancelled
    expect(allocation.releaseDate).toBe(mockClarity.blockHeight)
    
    // Check that funds were returned to the pool
    pool = mockClarity.contracts.fundingAllocation.getFundingPool(1)
    expect(pool.remainingFunds).toBe(100000) // Funds returned
  })
})
