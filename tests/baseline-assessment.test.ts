import { describe, it, expect, beforeEach } from "vitest"

// Mock the Clarity VM environment
const mockClarity = {
  contracts: {},
  txSender: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  blockHeight: 100,
}

// Mock implementation of the baseline-assessment contract
const setupBaselineAssessmentContract = () => {
  const assessors = new Map()
  const baselineAssessments = new Map()
  
  return {
    addAssessor: (assessor) => {
      if (mockClarity.txSender !== mockClarity.contracts.baselineAssessment.contractOwner) {
        return { type: "err", value: 100 } // err-not-authorized
      }
      assessors.set(assessor, { active: true })
      return { type: "ok", value: true }
    },
    
    removeAssessor: (assessor) => {
      if (mockClarity.txSender !== mockClarity.contracts.baselineAssessment.contractOwner) {
        return { type: "err", value: 100 } // err-not-authorized
      }
      assessors.set(assessor, { active: false })
      return { type: "ok", value: true }
    },
    
    createBaselineAssessment: (
        projectId,
        soilQuality,
        biodiversityIndex,
        waterQuality,
        carbonStorage,
        additionalData,
    ) => {
      const assessor = assessors.get(mockClarity.txSender)
      if (!assessor || !assessor.active) {
        return { type: "err", value: 100 } // err-not-authorized
      }
      
      if (baselineAssessments.has(projectId)) {
        return { type: "err", value: 101 } // err-assessment-exists
      }
      
      baselineAssessments.set(projectId, {
        soilQuality,
        biodiversityIndex,
        waterQuality,
        carbonStorage,
        assessmentDate: mockClarity.blockHeight,
        assessor: mockClarity.txSender,
        additionalData,
      })
      
      return { type: "ok", value: true }
    },
    
    updateBaselineAssessment: (
        projectId,
        soilQuality,
        biodiversityIndex,
        waterQuality,
        carbonStorage,
        additionalData,
    ) => {
      const assessment = baselineAssessments.get(projectId)
      if (!assessment) {
        return { type: "err", value: 102 } // err-invalid-project
      }
      
      if (assessment.assessor !== mockClarity.txSender) {
        return { type: "err", value: 100 } // err-not-authorized
      }
      
      baselineAssessments.set(projectId, {
        soilQuality,
        biodiversityIndex,
        waterQuality,
        carbonStorage,
        assessmentDate: mockClarity.blockHeight,
        assessor: mockClarity.txSender,
        additionalData,
      })
      
      return { type: "ok", value: true }
    },
    
    getBaselineAssessment: (projectId) => {
      return baselineAssessments.get(projectId) || null
    },
    
    isAssessor: (address) => {
      const assessor = assessors.get(address)
      return assessor ? assessor.active : false
    },
    
    getVersion: () => 1,
    
    contractOwner: mockClarity.txSender,
  }
}

describe("Baseline Assessment Contract", () => {
  beforeEach(() => {
    // Reset the mock Clarity environment
    mockClarity.contracts = {
      baselineAssessment: setupBaselineAssessmentContract(),
    }
  })
  
  it("should allow contract owner to add assessors", () => {
    const assessor = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    const result = mockClarity.contracts.baselineAssessment.addAssessor(assessor)
    expect(result.type).toBe("ok")
    expect(mockClarity.contracts.baselineAssessment.isAssessor(assessor)).toBe(true)
  })
  
  it("should not allow non-owner to add assessors", () => {
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    
    const assessor = "ST3CECAKJ4BH08JYY7W53MC81BYDT4YDA5Z7GZQZJ"
    const result = mockClarity.contracts.baselineAssessment.addAssessor(assessor)
    
    expect(result.type).toBe("err")
    expect(result.value).toBe(100) // err-not-authorized
    expect(mockClarity.contracts.baselineAssessment.isAssessor(assessor)).toBe(false)
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should allow assessors to create baseline assessments", () => {
    // Add an assessor
    const assessor = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    mockClarity.contracts.baselineAssessment.addAssessor(assessor)
    
    // Switch to assessor
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = assessor
    
    // Create a baseline assessment
    const result = mockClarity.contracts.baselineAssessment.createBaselineAssessment(
        1, // projectId
        75, // soilQuality
        80, // biodiversityIndex
        70, // waterQuality
        5000, // carbonStorage
        "Initial assessment of the project area",
    )
    
    expect(result.type).toBe("ok")
    
    // Check assessment data
    const assessment = mockClarity.contracts.baselineAssessment.getBaselineAssessment(1)
    expect(assessment).not.toBeNull()
    expect(assessment.soilQuality).toBe(75)
    expect(assessment.biodiversityIndex).toBe(80)
    expect(assessment.waterQuality).toBe(70)
    expect(assessment.carbonStorage).toBe(5000)
    expect(assessment.assessor).toBe(assessor)
    expect(assessment.assessmentDate).toBe(mockClarity.blockHeight)
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should not allow non-assessors to create baseline assessments", () => {
    // Switch to non-assessor
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    
    // Try to create a baseline assessment
    const result = mockClarity.contracts.baselineAssessment.createBaselineAssessment(
        1, // projectId
        75, // soilQuality
        80, // biodiversityIndex
        70, // waterQuality
        5000, // carbonStorage
        "Initial assessment of the project area",
    )
    
    expect(result.type).toBe("err")
    expect(result.value).toBe(100) // err-not-authorized
    
    // Check that no assessment was created
    const assessment = mockClarity.contracts.baselineAssessment.getBaselineAssessment(1)
    expect(assessment).toBeNull()
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should not allow creating duplicate assessments for the same project", () => {
    // Add an assessor
    const assessor = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    mockClarity.contracts.baselineAssessment.addAssessor(assessor)
    
    // Switch to assessor
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = assessor
    
    // Create a baseline assessment
    mockClarity.contracts.baselineAssessment.createBaselineAssessment(
        1, // projectId
        75, // soilQuality
        80, // biodiversityIndex
        70, // waterQuality
        5000, // carbonStorage
        "Initial assessment of the project area",
    )
    
    // Try to create another assessment for the same project
    const result = mockClarity.contracts.baselineAssessment.createBaselineAssessment(
        1, // same projectId
        80, // soilQuality
        85, // biodiversityIndex
        75, // waterQuality
        5500, // carbonStorage
        "Second assessment attempt",
    )
    
    expect(result.type).toBe("err")
    expect(result.value).toBe(101) // err-assessment-exists
    
    // Check that the original assessment is unchanged
    const assessment = mockClarity.contracts.baselineAssessment.getBaselineAssessment(1)
    expect(assessment.soilQuality).toBe(75)
    expect(assessment.additionalData).toBe("Initial assessment of the project area")
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should allow the original assessor to update an assessment", () => {
    // Add an assessor
    const assessor = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    mockClarity.contracts.baselineAssessment.addAssessor(assessor)
    
    // Switch to assessor
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = assessor
    
    // Create a baseline assessment
    mockClarity.contracts.baselineAssessment.createBaselineAssessment(
        1, // projectId
        75, // soilQuality
        80, // biodiversityIndex
        70, // waterQuality
        5000, // carbonStorage
        "Initial assessment of the project area",
    )
    
    // Update the assessment
    const result = mockClarity.contracts.baselineAssessment.updateBaselineAssessment(
        1, // projectId
        80, // updated soilQuality
        85, // updated biodiversityIndex
        75, // updated waterQuality
        5500, // updated carbonStorage
        "Updated assessment with more accurate data",
    )
    
    expect(result.type).toBe("ok")
    
    // Check that the assessment was updated
    const assessment = mockClarity.contracts.baselineAssessment.getBaselineAssessment(1)
    expect(assessment.soilQuality).toBe(80)
    expect(assessment.biodiversityIndex).toBe(85)
    expect(assessment.waterQuality).toBe(75)
    expect(assessment.carbonStorage).toBe(5500)
    expect(assessment.additionalData).toBe("Updated assessment with more accurate data")
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
  
  it("should not allow a different assessor to update an assessment", () => {
    // Add two assessors
    const assessor1 = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
    const assessor2 = "ST3CECAKJ4BH08JYY7W53MC81BYDT4YDA5Z7GZQZJ"
    mockClarity.contracts.baselineAssessment.addAssessor(assessor1)
    mockClarity.contracts.baselineAssessment.addAssessor(assessor2)
    
    // Switch to first assessor
    const originalTxSender = mockClarity.txSender
    mockClarity.txSender = assessor1
    
    // Create a baseline assessment
    mockClarity.contracts.baselineAssessment.createBaselineAssessment(
        1, // projectId
        75, // soilQuality
        80, // biodiversityIndex
        70, // waterQuality
        5000, // carbonStorage
        "Initial assessment of the project area",
    )
    
    // Switch to second assessor
    mockClarity.txSender = assessor2
    
    // Try to update the assessment
    const result = mockClarity.contracts.baselineAssessment.updateBaselineAssessment(
        1, // projectId
        80, // updated soilQuality
        85, // updated biodiversityIndex
        75, // updated waterQuality
        5500, // updated carbonStorage
        "Attempted update by different assessor",
    )
    
    expect(result.type).toBe("err")
    expect(result.value).toBe(100) // err-not-authorized
    
    // Check that the assessment was not updated
    const assessment = mockClarity.contracts.baselineAssessment.getBaselineAssessment(1)
    expect(assessment.soilQuality).toBe(75)
    expect(assessment.additionalData).toBe("Initial assessment of the project area")
    expect(assessment.assessor).toBe(assessor1)
    
    // Reset tx-sender
    mockClarity.txSender = originalTxSender
  })
})
