import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  Expert: a
    .model({
      name: a.string().required(),
      role: a.string().required(),
      email: a.email(),
      phone: a.string(),
      avatarUrl: a.string(),
      category: a.string(),
      norma: a.integer().default(8),
      normType: a.string(),
      oreZi: a.float(),
      manualMonthlyNorm: a.float(),
      projectMonthlyNorm: a.float(),
      basePositionConcordia: a.string(),
      positionInProject: a.string(),
      goodworksPosition: a.string(),
      projectCode: a.string(),
      projectTitle: a.string(),
      contractNumber: a.string(),
      contractType: a.string(),
      expertExperienceCategory: a.string(),
      jobDescriptionText: a.string(),
      aiReportingInstructions: a.string(),
      beneficiary: a.string(),
      saCodes: a.string().array(),
      hasPmAccess: a.boolean().default(false),
      isActive: a.boolean().default(true),
      activities: a.hasMany("Activity", "expertId"),
      reportingWorkBlocks: a.hasMany("ReportingWorkBlock", "expertId"),
      grupTintaEntries: a.hasMany("GrupTintaEntry", "expertId"),
      historicalReports: a.hasMany("MonthlyExpertReport", "expertId"),
      normContracts: a.hasMany("ExpertNormContract", "expertId"),
      leaveEntries: a.hasMany("LeaveEntry", "expertId"),
      financialPersonLinks: a.hasMany("FinancialPersonLink", "expertId"),

    })
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ExpertNormContract: a
    .model({
      expertId: a.id().required(),
      expert: a.belongsTo("Expert", "expertId"),
      validFrom: a.date().required(),
      validTo: a.date(),
      peoNormUnit: a.string().required(),
      peoNormValue: a.float().required(),
      peoDailyCap: a.float().required(),
      cimNormUnit: a.string().required(),
      cimNormValue: a.float().required(),
      cimDailyCap: a.float().required(),
      leaveHoursPerDay: a.float().required(),
      status: a.string().default("ACTIVE"),
      justification: a.string().required(),
      createdBy: a.string(),
      updatedBy: a.string(),
    })
    .secondaryIndexes((index) => [
      index("expertId").sortKeys(["validFrom"]),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  FinancialPersonLink: a
    .model({
      financialPersonName: a.string().required(),
      financialPersonKey: a.string().required(),
      expertId: a.id(),
      expert: a.belongsTo("Expert", "expertId"),
      status: a.string().default("suggested"),
      confidence: a.float().default(0),
      source: a.string().default("automatic"),
      createdBy: a.string(),
      updatedBy: a.string(),
    })
    .secondaryIndexes((index) => [
      index("financialPersonKey"),
      index("expertId"),
      index("status"),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ReportingPeriod: a
    .model({
      projectCode: a.string().required(),
      code: a.string().required(),
      startMonth: a.integer().required(),
      startYear: a.integer().required(),
      monthCount: a.integer().required(),
      endMonth: a.integer().required(),
      endYear: a.integer().required(),
      status: a.string().default("draft"),
      notes: a.string(),
      createdBy: a.string(),
      updatedBy: a.string(),
      publishedAt: a.datetime(),
      closedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [
      index("projectCode").sortKeys(["code"]),
      index("status"),
    ])
    .authorization((allow) => [
      allow.groups(["pm"]).to(["read"]),
      allow.groups(["admin"]).to(["create", "read", "update", "delete"]),
    ]),

  LeaveEntry: a
    .model({
      owner: a.string(),
      expertId: a.id().required(),
      expert: a.belongsTo("Expert", "expertId"),
      date: a.date().required(),
      month: a.integer().required(),
      year: a.integer().required(),
      type: a.string().required(),
      totalHours: a.float().required(),
      peoHours: a.float().required(),
      cpcHours: a.float().required(),
      source: a.string().required(),
      status: a.string().default("DRAFT"),
      lockedForExpert: a.boolean().default(false),
      normContractId: a.id(),
      automaticSplit: a.boolean().default(true),
      peoNormUnit: a.string(),
      peoNormValue: a.float(),
      peoDailyCap: a.float(),
      cimNormUnit: a.string(),
      cimNormValue: a.float(),
      cimDailyCap: a.float(),
      justification: a.string(),
      rejectionReason: a.string(),
      createdBy: a.string(),
      validatedBy: a.string(),
      validatedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [
      index("expertId").sortKeys(["date"]),
      index("year").sortKeys(["month"]),
    ])
    .authorization((allow) => [
      allow.ownerDefinedIn("owner"),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),


  Activity: a
    .model({
      owner: a.string(),
      expertId: a.id().required(),
      expert: a.belongsTo("Expert", "expertId"),
      expertName: a.string(),
      date: a.date().required(),
      year: a.integer().required(),
      month: a.integer().required(),
      hours: a.float().required(),
      activityType: a.string().required(),
      saCode: a.string(),
      catalogActivityId: a.id(),
      title: a.string().required(),
      description: a.string(),
      activitySummary: a.string(),
      activitySummaryGeneratedAt: a.datetime(),
      activitySummaryAuditId: a.string(),
      activityKeywords: a.string(),
      location: a.string(),
      dayType: a.string(),
      workingGroupId: a.id(),
      periodGroupId: a.string(),
      status: a.string().default("draft"),
      shareStatus: a.string().default("private"),
      originActivityId: a.id(),
      takenByExperts: a.string().array(),
      projectCode: a.string(),
      autoGenerated: a.boolean().default(false),
      generatedAt: a.datetime(),
      generatedBy: a.string(),
      pmNotes: a.string(),
      gdprTemplateCode: a.string(),
      gdprMetaJson: a.string(),
      gdprGeneratedText: a.string(),
      gdprConclusionCode: a.string(),
      businessHubMetaJson: a.string(),
      eventDurationHours: a.float(),
      eventExtendedDescription: a.string(),
      deliverables: a.hasMany("Deliverable", "activityId"),
      workBlockLinks: a.hasMany("WorkBlockActivityLink", "activityId"),
      grupTinta: a.hasMany("GrupTintaEntry", "activityId"),
    })
    .secondaryIndexes((index) => [
      index("expertId").sortKeys(["date"]),
      index("year").sortKeys(["month"]),
      index("shareStatus").sortKeys(["date"]),
      index("originActivityId"),
    ])
    .authorization((allow) => [
      allow.ownerDefinedIn("owner"),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  LegalHoliday: a
    .model({
      countryCode: a.string().default("RO"),
      date: a.date().required(),
      year: a.integer().required(),
      name: a.string().required(),
      type: a.string().required(),
      source: a.string(),
      sourceUrl: a.string(),
      notes: a.string(),
      isActive: a.boolean().default(true),
    })
    .secondaryIndexes((index) => [
      index("date"),
      index("year").sortKeys(["date"]),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  Deliverable: a
    .model({
      owner: a.string(),
      activityId: a.id().required(),
      activity: a.belongsTo("Activity", "activityId"),
      fileName: a.string().required(),
      fileType: a.string().required(),
      fileSize: a.integer().required(),
      filePath: a.string(),
      documentId: a.id(),
      s3Bucket: a.string(),
      s3Key: a.string(),
      originalFileName: a.string(),
      fileHash: a.string(),
      firstPageTextHash: a.string(),
      contentFingerprint: a.string(),
      uploadedByExpertId: a.id(),
      uploadedByExpertName: a.string(),
      expertId: a.id(),
      projectId: a.string(),
      projectCode: a.string(),
      projectName: a.string(),
      month: a.integer(),
      year: a.integer(),
      sourceActivityId: a.id(),
      activityDate: a.date(),
      saCode: a.string(),
      deliverableType: a.string(),
      isCommonDeliverable: a.boolean().default(false),
      sharedWithExpertIds: a.string().array(),
      possibleDuplicateOfDocumentId: a.id(),
      duplicateStatus: a.string(),
      uploadError: a.string(),
      uploadedAt: a.datetime(),
      declaredTitle: a.string(),
      docTitle: a.string(),
      docText: a.string(),
      suggestedTitle: a.string(),
      titleSuggestionConfidence: a.string(),
      titleSuggestionAlternatives: a.string().array(),
      titleSuggestionReason: a.string(),
      firstPageText: a.string(),
      titleSource: a.string(),
      titleMatch: a.boolean(),
      titleConfirmed: a.boolean(),
      titleCheckStatus: a.string(),
      titleCheckMessage: a.string(),
      aiStatus: a.string(),
      aiReason: a.string(),
      eligibilityCheck: a.json(),
      extractedSummary: a.json(),
      confirmedReportingData: a.json(),
      summaryStatus: a.string(),
      summaryVersion: a.integer(),
      summaryGeneratedAt: a.datetime(),
      workBlockLinks: a.hasMany("WorkBlockDeliverableLink", "deliverableId"),
    })
    .secondaryIndexes((index) => [
      index("activityId"),
      index("expertId").sortKeys(["year", "month"]),
      index("projectCode").sortKeys(["year", "month"]),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.ownerDefinedIn("owner"),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ReportingWorkBlock: a
    .model({
      owner: a.string(),
      expertId: a.id().required(),
      expert: a.belongsTo("Expert", "expertId"),
      projectCode: a.string().required(),
      month: a.integer().required(),
      year: a.integer().required(),
      title: a.string().required(),
      saCode: a.string().required(),
      activityCode: a.string(),
      activityCategory: a.string(),
      reportingFlowType: a.string().required(),
      expertContribution: a.string(),
      beneficiaries: a.string().array(),
      indicatorContribution: a.string(),
      cleanedActivitySummary: a.string(),
      generatedTableSummary: a.string(),
      generatedNarrative: a.string(),
      generationInputsHash: a.string(),
      aiConsolidationStatus: a.string(),
      aiConsolidationUpdatedAt: a.datetime(),
      status: a.string().default("draft"),
      activityLinks: a.hasMany("WorkBlockActivityLink", "workBlockId"),
      deliverableLinks: a.hasMany("WorkBlockDeliverableLink", "workBlockId"),
    })
    .secondaryIndexes((index) => [
      index("expertId").sortKeys(["year", "month"]),
      index("projectCode").sortKeys(["year", "month"]),
      index("status"),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.ownerDefinedIn("owner"),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  WorkBlockActivityLink: a
    .model({
      owner: a.string(),
      workBlockId: a.id().required(),
      workBlock: a.belongsTo("ReportingWorkBlock", "workBlockId"),
      activityId: a.id().required(),
      activity: a.belongsTo("Activity", "activityId"),
      allocatedHours: a.float().required(),
    })
    .secondaryIndexes((index) => [
      index("workBlockId"),
      index("activityId"),
    ])
    .authorization((allow) => [
      allow.ownerDefinedIn("owner"),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  WorkBlockDeliverableLink: a
    .model({
      owner: a.string(),
      workBlockId: a.id().required(),
      workBlock: a.belongsTo("ReportingWorkBlock", "workBlockId"),
      deliverableId: a.id().required(),
      deliverable: a.belongsTo("Deliverable", "deliverableId"),
      isPrimary: a.boolean().default(false),
      contributionType: a.string(),
    })
    .secondaryIndexes((index) => [
      index("workBlockId"),
      index("deliverableId"),
    ])
    .authorization((allow) => [
      allow.ownerDefinedIn("owner"),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ActivityMapping: a
    .model({
      projectCode: a.string().required(),
      saCode: a.string().required(),
      activityCode: a.string().required(),
      activityTitle: a.string().required(),
      saFullTitle: a.string(),
      allowedExpertCategories: a.string().array(),
      isActive: a.boolean().default(true),
    })
    .secondaryIndexes((index) => [
      index("projectCode").sortKeys(["saCode", "activityCode"]),
      index("saCode"),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  Document: a
    .model({
      s3Bucket: a.string(),
      s3Key: a.string().required(),
      originalFileName: a.string().required(),
      mimeType: a.string().required(),
      fileSize: a.integer().required(),
      fileHash: a.string(),
      firstPageTextHash: a.string(),
      contentFingerprint: a.string(),
      uploadedByExpertId: a.id().required(),
      uploadedByExpertName: a.string(),
      uploadDate: a.datetime().required(),
      projectId: a.string(),
      projectName: a.string(),
      sourceActivityId: a.id(),
      activityDate: a.date(),
      saCode: a.string(),
      deliverableType: a.string(),
      declaredTitle: a.string(),
      suggestedTitle: a.string(),
      docText: a.string(),
      firstPageText: a.string(),
      titleSuggestionConfidence: a.string(),
      titleSuggestionAlternatives: a.string().array(),
      titleSuggestionReason: a.string(),
      extractedTitle: a.string(),
      extractedTitleNormalized: a.string(),
      titleSource: a.string(),
      titleMatch: a.boolean(),
      titleCheckStatus: a.string(),
      titleCheckMessage: a.string(),
      eligibilityCheck: a.json(),
      isCommonDeliverable: a.boolean().default(false),
      possibleDuplicateOfDocumentId: a.id(),
      duplicateStatus: a.string(),
    })
    .secondaryIndexes((index) => [
      index("uploadedByExpertId").sortKeys(["uploadDate"]),
      index("projectId"),
      index("fileHash"),
      index("firstPageTextHash"),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["create", "read", "update"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  IndexedDeliverableCandidate: a
    .model({
      owner: a.string(),
      expertId: a.id().required(),
      uploadedBy: a.string(),
      uploadedByName: a.string(),
      reportingMonth: a.integer().required(),
      reportingYear: a.integer().required(),
      projectCode: a.string(),
      fileName: a.string().required(),
      originalFileName: a.string(),
      storagePath: a.string().required(),
      s3Key: a.string(),
      mimeType: a.string().required(),
      fileType: a.string(),
      fileSize: a.integer().required(),
      fileHash: a.string(),
      firstPageTextHash: a.string(),
      contentFingerprint: a.string(),
      extractedText: a.string(),
      extractedTextPreview: a.string(),
      detectedDate: a.date(),
      suggestedTitle: a.string(),
      suggestedType: a.string(),
      suggestedSaCode: a.string(),
      suggestedActivityCatalogId: a.id(),
      suggestedActivityName: a.string(),
      suggestedDescription: a.string(),
      suggestedResult: a.string(),
      eligibilityStatus: a.string().required(),
      eligibilityReason: a.string(),
      eligibilityScore: a.integer(),
      confidence: a.string(),
      alternativeMatches: a.json(),
      keywords: a.string().array(),
      warnings: a.string().array(),
      notes: a.string(),
      ragUsed: a.boolean().default(false),
      ragSummary: a.string(),
      modelAuditId: a.string(),
      status: a.string().required(),
      approvedAt: a.datetime(),
      approvedBy: a.string(),
      createdActivityId: a.id(),
    })
    .secondaryIndexes((index) => [
      index("expertId").sortKeys(["reportingYear", "reportingMonth"]),
      index("reportingYear").sortKeys(["reportingMonth"]),
      index("status"),
    ])
    .authorization((allow) => [
      allow.ownerDefinedIn("owner"),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  SharedDeliverable: a
    .model({
      documentId: a.id().required(),
      sourceExpertId: a.id().required(),
      targetExpertId: a.id().required(),
      projectId: a.string(),
      sourceActivityId: a.id(),
      targetActivityId: a.id(),
      sourceExpertName: a.string(),
      sourceActivityDate: a.date(),
      sourceActivityHours: a.float(),
      sourceActivityType: a.string(),
      sourceActivityTitle: a.string(),
      sourceActivityDescription: a.string(),
      sourceActivityLocation: a.string(),
      sourceActivityDayType: a.string(),
      sourceActivitySaCode: a.string(),
      sourceActivityCatalogActivityId: a.id(),
      sourceActivityProjectCode: a.string(),
      sourceActivityEventDurationHours: a.float(),
      sourceActivityEventExtendedDescription: a.string(),
      status: a.string().required(),
      notifiedAt: a.datetime(),
      registeredAt: a.datetime(),
      ignoredAt: a.datetime(),
      removedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [
      index("documentId"),
      index("targetExpertId").sortKeys(["status"]),
      index("sourceExpertId"),
      index("projectId"),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["create", "read", "update"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  GrupTintaEntry: a
    .model({
      owner: a.string(),
      expertId: a.id().required(),
      expert: a.belongsTo("Expert", "expertId"),
      activityId: a.id(),
      activity: a.belongsTo("Activity", "activityId"),
      date: a.date().required(),
      year: a.integer().required(),
      month: a.integer().required(),
      activityType: a.string().required(),
      organizations: a.string().array(),
      participantsCount: a.integer().default(0),
      notes: a.string(),
    })
    .secondaryIndexes((index) => [
      index("expertId").sortKeys(["date"]),
      index("year").sortKeys(["month"]),
    ])
    .authorization((allow) => [
      allow.ownerDefinedIn("owner"),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  Organization: a
    .model({
      name: a.string().required(),
      normalizedName: a.string().required(),
      kind: a.string().required(),
      legalForm: a.string(),
      cui: a.string(),
      parentOrganizationId: a.id(),
      federationName: a.string(),
      patronalOrganizationName: a.string(),
      employeeCount: a.integer(),
      status: a.string().default("active"),
      sourceSheet: a.string(),
      sourceRowNumber: a.integer(),
      importBatchId: a.id(),
      importBatch: a.belongsTo("GTImportBatch", "importBatchId"),
      gtNotes: a.string(),
      gtEntities: a.hasMany("GTEntity", "organizationId"),
    })
    .secondaryIndexes((index) => [
      index("cui"),
      index("normalizedName"),
      index("kind").sortKeys(["normalizedName"]),
      index("parentOrganizationId"),
      index("importBatchId"),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  GTEntity: a
    .model({
      organizationId: a.id().required(),
      organization: a.belongsTo("Organization", "organizationId"),
      organizationName: a.string(),
      status: a.string().required(),
      dataIntrareOperatiune: a.date(),
      dataIesireOperatiune: a.date(),
      indicator5SO04: a.boolean().default(false),
      indicator5SR04: a.boolean().default(false),
      region: a.string(),
      expertResponsabilId: a.id(),
      notes: a.string(),
      sourceStatusText: a.string(),
      persons: a.hasMany("GTPerson", "gtEntityId"),
      documents: a.hasMany("GTDocument", "gtEntityId"),
      monitoringRecords: a.hasMany("GTMonitoringRecord", "gtEntityId"),
    })
    .secondaryIndexes((index) => [
      index("organizationId"),
      index("status").sortKeys(["organizationName"]),
      index("expertResponsabilId"),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  GTPerson: a
    .model({
      gtEntityId: a.id().required(),
      gtEntity: a.belongsTo("GTEntity", "gtEntityId"),
      nume: a.string().required(),
      prenume: a.string().required(),
      cnpHash: a.string(),
      email: a.email(),
      telefon: a.string(),
      functie: a.string(),
      status: a.string().required(),
      dataIntrareOperatiune: a.date(),
      dataIesireOperatiune: a.date(),
      indicator5SO01: a.boolean().default(false),
      indicator5SR01: a.boolean().default(false),
      consimtamantGDPRAt: a.datetime(),
      notes: a.string(),
      documents: a.hasMany("GTDocument", "gtPersonId"),
      monitoringRecords: a.hasMany("GTMonitoringRecord", "gtPersonId"),
    })
    .secondaryIndexes((index) => [
      index("gtEntityId").sortKeys(["nume"]),
      index("status").sortKeys(["nume"]),
      index("cnpHash"),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  GTDocument: a
    .model({
      subjectType: a.string().required(),
      gtEntityId: a.id(),
      gtEntity: a.belongsTo("GTEntity", "gtEntityId"),
      gtPersonId: a.id(),
      gtPerson: a.belongsTo("GTPerson", "gtPersonId"),
      documentType: a.string().required(),
      s3Key: a.string(),
      fileName: a.string(),
      status: a.string().default("lipsa"),
      validatedByExpertId: a.id(),
      validatedAt: a.datetime(),
      expiryDate: a.date(),
      notes: a.string(),
    })
    .secondaryIndexes((index) => [
      index("gtEntityId").sortKeys(["documentType"]),
      index("gtPersonId").sortKeys(["documentType"]),
      index("status").sortKeys(["documentType"]),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  GTMonitoringRecord: a
    .model({
      subjectType: a.string().required(),
      gtEntityId: a.id(),
      gtEntity: a.belongsTo("GTEntity", "gtEntityId"),
      gtPersonId: a.id(),
      gtPerson: a.belongsTo("GTPerson", "gtPersonId"),
      date: a.date().required(),
      year: a.integer().required(),
      month: a.integer().required(),
      expertId: a.id(),
      linkedActivityId: a.id(),
      saCode: a.string(),
      indicatorCode: a.string(),
      obiectivSpecific: a.string(),
      descriere: a.string(),
      rezultat: a.string(),
    })
    .secondaryIndexes((index) => [
      index("gtEntityId").sortKeys(["date"]),
      index("gtPersonId").sortKeys(["date"]),
      index("year").sortKeys(["month"]),
      index("linkedActivityId"),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  GTImportBatch: a
    .model({
      sourceFileName: a.string().required(),
      importedBy: a.string(),
      importedAt: a.datetime().required(),
      status: a.string().required(),
      totalRows: a.integer(),
      createdOrganizations: a.integer(),
      duplicateRows: a.integer(),
      warningsJson: a.string(),
      organizations: a.hasMany("Organization", "importBatchId"),
    })
    .secondaryIndexes((index) => [
      index("status").sortKeys(["importedAt"]),
      index("sourceFileName"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  BusinessHubEntityDirectory: a
    .model({
      directoryType: a.string().required(),
      acronym: a.string().required(),
      legalName: a.string().required(),
      displayName: a.string(),
      registeredAddress: a.string(),
      cuiOrCif: a.string(),
      phone: a.string(),
      email: a.string(),
      legalRepresentativeName: a.string(),
      legalRepresentativeRole: a.string(),
      designatedPersonName: a.string(),
      status: a.string().default("active"),
      source: a.string(),
    })
    .secondaryIndexes((index) => [
      index("directoryType").sortKeys(["acronym"]),
      index("status").sortKeys(["directoryType"]),
    ])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ActivityCatalog: a
    .model({
      category: a.string().required(),
      saCode: a.string().required(),
      gdprTemplateCode: a.string(),
      serviceCategory: a.string(),
      activityNumber: a.integer(),
      activityName: a.string().required(),
      isActive: a.boolean().default(true),
      requiresSameDayForSharedDeliverable: a.boolean(),
      description: a.string(),
      objectives: a.string(),
      serviceComponent: a.string(),
      beneficiaries: a.string(),
      expectedResults: a.string(),
      deliverables: a.string(),
      indicators: a.string(),
    })
    .secondaryIndexes((index) => [index("saCode")])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  KnowledgeDocument: a
    .model({
      title: a.string().required(),
      sourceType: a.string().required(),
      category: a.string(),
      expertId: a.id(),
      expertName: a.string(),
      expertRole: a.string(),
      projectCode: a.string(),
      month: a.integer(),
      year: a.integer(),
      saCode: a.string(),
      activityName: a.string(),
      approvalStatus: a.string(),
      originalFileName: a.string(),
      s3Key: a.string(),
      textHash: a.string(),
      extractedTextPreview: a.string(),
      status: a.string().default("active"),
      indexedAt: a.datetime(),
      createdBy: a.string(),
      metadataJson: a.string(),
    })
    .secondaryIndexes((index) => [
      index("sourceType"),
      index("category").sortKeys(["sourceType"]),
      index("projectCode"),
      index("saCode"),
      index("expertId"),
      index("status"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  KnowledgeChunk: a
    .model({
      documentId: a.id().required(),
      chunkIndex: a.integer().required(),
      text: a.string().required(),
      textHash: a.string(),
      embeddingJson: a.string(),
      embeddingModel: a.string(),
      tokenEstimate: a.integer(),
      sourceType: a.string(),
      category: a.string(),
      expertId: a.id(),
      expertName: a.string(),
      projectCode: a.string(),
      month: a.integer(),
      year: a.integer(),
      saCode: a.string(),
      activityName: a.string(),
      status: a.string().default("active"),
      metadataJson: a.string(),
    })
    .secondaryIndexes((index) => [
      index("documentId"),
      index("category").sortKeys(["sourceType"]),
      index("sourceType"),
      index("saCode"),
      index("expertId"),
      index("status"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ActivityAutofillAudit: a
    .model({
      expertId: a.id(),
      expertName: a.string(),
      expertRole: a.string(),
      category: a.string(),
      projectCode: a.string(),
      month: a.integer(),
      year: a.integer(),
      activityId: a.id(),
      deliverableIds: a.string().array(),
      suggestedSaCode: a.string(),
      suggestedActivityName: a.string(),
      suggestedDescriptionPreview: a.string(),
      confidence: a.string(),
      modelAuditId: a.string(),
      retrievalJson: a.string(),
      candidateJson: a.string(),
      warningsJson: a.string(),
      applied: a.boolean().default(false),
      appliedAt: a.datetime(),
      finalSaCode: a.string(),
      finalActivityName: a.string(),
      finalDescriptionPreview: a.string(),
    })
    .secondaryIndexes((index) => [
      index("expertId").sortKeys(["year", "month"]),
      index("category").sortKeys(["year", "month"]),
      index("projectCode"),
      index("modelAuditId"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  AiEligibilityRuleset: a
    .model({
      title: a.string().required(),
      status: a.string().default("draft"),
      version: a.integer().default(1),
      rulesJson: a.json(),
      schemaVersion: a.string().default("eligibility-rules-v1"),
      activeFrom: a.datetime(),
      publishedAt: a.datetime(),
      publishedBy: a.string(),
      createdBy: a.string(),
      updatedBy: a.string(),
      changeReason: a.string(),
    })
    .secondaryIndexes((index) => [
      index("status").sortKeys(["version"]),
      index("schemaVersion"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  AiEligibilityRuleVersion: a
    .model({
      rulesetId: a.id().required(),
      version: a.integer().required(),
      status: a.string().required(),
      previousRulesJson: a.json(),
      newRulesJson: a.json(),
      changedBy: a.string(),
      changeReason: a.string(),
      publishedAt: a.datetime(),
      archivedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [
      index("rulesetId").sortKeys(["version"]),
      index("status"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  WorkingGroup: a
    .model({
      name: a.string().required(),
      type: a.string().required(),
      email: a.email(),
      isActive: a.boolean().default(true),
      saCode: a.string(),
      notes: a.string(),
    })
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ReportStatus: a
    .model({
      expertId: a.id().required(),
      year: a.integer().required(),
      month: a.integer().required(),
      status: a.string().default("draft"),
      sentDate: a.datetime(),
      approvalDate: a.datetime(),
      expertAccessApproved: a.boolean().default(false),
      expertAccessApprovedAt: a.datetime(),
      pmNotes: a.string(),
    })
    .secondaryIndexes((index) => [index("expertId").sortKeys(["year", "month"])])
    .authorization((allow) => [
      allow.groups(["expert"]).to(["create", "read", "update"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  MonthAccessRequest: a
    .model({
      expertId: a.id().required(),
      expertName: a.string(),
      year: a.integer().required(),
      month: a.integer().required(),
      status: a.string().default("pending"),
      requestedAt: a.datetime(),
      requestedBy: a.string(),
      resolvedAt: a.datetime(),
      resolvedBy: a.string(),
      closedAt: a.datetime(),
      closedBy: a.string(),
      notes: a.string(),
    })
    .secondaryIndexes((index) => [
      index("expertId").sortKeys(["year", "month"]),
      index("status").sortKeys(["year", "month"]),
    ])
    .authorization((allow) => [
      allow.groups(["expert"]).to(["create", "read"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  Verification: a
    .model({
      expertId: a.id().required(),
      expertName: a.string(),
      month: a.string().required(),
      year: a.string().required(),
      status: a.string().default("pending"),
      notes: a.string(),
      neconformitati: a.hasMany("Neconformitate", "verificationId"),
      verificationNotes: a.hasMany("VerificationNote", "verificationId"),
    })
    .secondaryIndexes((index) => [index("expertId").sortKeys(["year", "month"])])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  Neconformitate: a
    .model({
      verificationId: a.id(),
      verification: a.belongsTo("Verification", "verificationId"),
      type: a.string().required(),
      severity: a.string().required(),
      description: a.string().required(),
      affectedDate: a.date(),
      affectedExpertId: a.id(),
      resolved: a.boolean().default(false),
      resolution: a.string(),
      resolvedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [index("verificationId")])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  VerificationNote: a
    .model({
      verificationId: a.id(),
      verification: a.belongsTo("Verification", "verificationId"),
      content: a.string().required(),
      category: a.string(),
      authorId: a.id(),
      authorName: a.string(),
    })
    .secondaryIndexes((index) => [index("verificationId")])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ConcurrentProject: a
    .model({
      expertId: a.id().required(),
      expertName: a.string(),
      projectName: a.string().required(),
      projectCode: a.string(),
      expertProjectRole: a.string(),
      fundingSource: a.string(),
      dailyHours: a.float().required(),
      startDate: a.date().required(),
      endDate: a.date(),
      isActive: a.boolean().default(true),
      status: a.string().default("validated"),
      validatedAt: a.datetime(),
      validatedBy: a.string(),
      assignmentSource: a.string(),
      expertFunction: a.string(),
      deliverableOptions: a.string().array(),
      notes: a.string(),
    })
    .secondaryIndexes((index) => [index("expertId")])
    .authorization((allow) => [
      allow.groups(["expert"]).to(["create", "read", "update"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ConcurrentProjectTimesheetEntry: a
    .model({
      concurrentProjectId: a.id().required(),
      expertId: a.id().required(),
      date: a.date().required(),
      month: a.integer().required(),
      year: a.integer().required(),
      wp: a.string(),
      hours: a.float().required(),
      taskName: a.string(),
      relevantDeliverable: a.string(),
      dayType: a.string().required(),
      notes: a.string(),
      status: a.string().required(),
      source: a.string().required(),
      createdBy: a.string(),
      updatedBy: a.string(),
    })
    .secondaryIndexes((index) => [index("concurrentProjectId"), index("expertId"), index("month"), index("year")])
    .authorization((allow) => [
      allow.groups(["expert"]).to(["create", "read", "update"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementProject: a
    .model({
      code: a.string().required(),
      title: a.string().required(),
      description: a.string(),
      category: a.string(),
      projectId: a.string(),
      projectCode: a.string(),
      mysmisCode: a.string(),
      subactivity: a.string(),
      procurementType: a.string().required(),
      procedureType: a.string().required(),
      responsibleUserId: a.string(),
      department: a.string(),
      currentStatus: a.string().default("PLANIFICATA"),
      estimatedValueWithoutVat: a.float().default(0),
      estimatedVatValue: a.float().default(0),
      estimatedValueWithVat: a.float().default(0),
      currency: a.string().default("RON"),
      budgetLine: a.string(),
      fundingSource: a.string(),
      plannedPeriod: a.string(),
      plannedStartYear: a.integer(),
      plannedEndYear: a.integer(),
      attentionLevel: a.string().default("on_track"),
      attentionLabel: a.string(),
      sourceRowNumber: a.integer(),
      sourceFileName: a.string(),
    })
    .secondaryIndexes((index) => [
      index("currentStatus"),
      index("procurementType"),
      index("procedureType"),
      index("plannedEndYear"),
      index("sourceRowNumber"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementDocument: a
    .model({
      procurementProjectId: a.id().required(),
      documentType: a.string().required(),
      title: a.string().required(),
      visibilityType: a.string().required(),
      stage: a.string().required(),
      fileUrl: a.string(),
      status: a.string().default("draft"),
      uploadedBy: a.string(),
      uploadedAt: a.datetime(),
      notes: a.string(),
    })
    .secondaryIndexes((index) => [
      index("procurementProjectId"),
      index("visibilityType"),
      index("stage"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementLaunch: a
    .model({
      procurementProjectId: a.id().required(),
      launchDate: a.date(),
      launchMethod: a.string(),
      launchChannel: a.string(),
      publishedUrl: a.string(),
      sentDocumentsSummary: a.string(),
      clarificationsDeadline: a.date(),
      offerDeadline: a.date(),
      publicationProofFileUrl: a.string(),
      status: a.string().default("draft"),
      createdBy: a.string(),
    })
    .secondaryIndexes((index) => [index("procurementProjectId"), index("status")])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementSupplier: a
    .model({
      name: a.string().required(),
      cui: a.string(),
      contactPerson: a.string(),
      email: a.email(),
      phone: a.string(),
      address: a.string(),
      isVatPayer: a.boolean().default(false),
    })
    .secondaryIndexes((index) => [index("name"), index("cui")])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementOffer: a
    .model({
      procurementProjectId: a.id().required(),
      supplierId: a.id(),
      receivedDate: a.date(),
      receivedTime: a.string(),
      receivedMethod: a.string(),
      offeredValueWithoutVat: a.float(),
      offeredValueWithVat: a.float(),
      currency: a.string().default("RON"),
      isVatPayer: a.boolean(),
      documentsComplete: a.boolean().default(false),
      eligibilityStatus: a.string(),
      capacityConformityStatus: a.string(),
      technicalConformityStatus: a.string(),
      financialScore: a.float(),
      isWinningOffer: a.boolean().default(false),
      notes: a.string(),
    })
    .secondaryIndexes((index) => [
      index("procurementProjectId"),
      index("supplierId"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementEvaluation: a
    .model({
      procurementProjectId: a.id().required(),
      offerId: a.id(),
      evaluationStage: a.string().required(),
      committeeDecisionDocumentId: a.id(),
      conflictOfInterestSigned: a.boolean().default(false),
      administrativeResult: a.string(),
      technicalResult: a.string(),
      financialResult: a.string(),
      decision: a.string(),
      notes: a.string(),
    })
    .secondaryIndexes((index) => [index("procurementProjectId"), index("offerId"), index("evaluationStage")])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementContract: a
    .model({
      procurementProjectId: a.id().required(),
      winningOfferId: a.id(),
      supplierId: a.id(),
      contractNumber: a.string(),
      contractDate: a.date(),
      contractValueWithoutVat: a.float(),
      contractValueWithVat: a.float(),
      currency: a.string().default("RON"),
      implementationStartDate: a.date(),
      implementationEndDate: a.date(),
      contractStatus: a.string().default("draft"),
      fileUrl: a.string(),
    })
    .secondaryIndexes((index) => [index("procurementProjectId"), index("supplierId"), index("contractStatus")])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementDeliverable: a
    .model({
      procurementContractId: a.id(),
      procurementProjectId: a.id().required(),
      title: a.string().required(),
      description: a.string(),
      dueDate: a.date(),
      deliveryDate: a.date(),
      status: a.string().default("PLANNED"),
      acceptanceNotes: a.string(),
      fileUrl: a.string(),
    })
    .secondaryIndexes((index) => [index("procurementProjectId"), index("procurementContractId"), index("status")])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementReception: a
    .model({
      procurementContractId: a.id(),
      procurementProjectId: a.id().required(),
      receptionDate: a.date(),
      receptionDocumentNumber: a.string(),
      receptionFileUrl: a.string(),
      status: a.string().default("DRAFT"),
      sentToFinancialAt: a.datetime(),
      notes: a.string(),
      createdBy: a.string(),
    })
    .secondaryIndexes((index) => [index("procurementProjectId"), index("procurementContractId"), index("status")])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementInvoice: a
    .model({
      procurementContractId: a.id(),
      procurementProjectId: a.id().required(),
      invoiceNumber: a.string(),
      invoiceDate: a.date(),
      invoiceValueWithoutVat: a.float(),
      invoiceVatValue: a.float(),
      invoiceValueWithVat: a.float(),
      currency: a.string().default("RON"),
      invoiceFileUrl: a.string(),
      sentToFinancialAt: a.datetime(),
      status: a.string().default("RECEIVED"),
      notes: a.string(),
    })
    .secondaryIndexes((index) => [index("procurementProjectId"), index("procurementContractId"), index("status")])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementStatusHistory: a
    .model({
      procurementProjectId: a.id().required(),
      oldStatus: a.string(),
      newStatus: a.string().required(),
      changedBy: a.string(),
      changedAt: a.datetime().required(),
      notes: a.string(),
    })
    .secondaryIndexes((index) => [index("procurementProjectId").sortKeys(["changedAt"]), index("newStatus")])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  ProcurementChecklist: a
    .model({
      procurementProjectId: a.id().required(),
      stage: a.string().required(),
      itemKey: a.string().required(),
      itemLabel: a.string().required(),
      isRequired: a.boolean().default(true),
      isCompleted: a.boolean().default(false),
      completedBy: a.string(),
      completedAt: a.datetime(),
      notes: a.string(),
    })
    .secondaryIndexes((index) => [
      index("procurementProjectId"),
      index("stage"),
      index("itemKey"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  HistoricalImportBatch: a
    .model({
      projectCode: a.string().required(),
      label: a.string().required(),
      reportingYear: a.integer().required(),
      monthsIncluded: a.integer().array(),
      importedBy: a.string().required(),
      importedAt: a.datetime().required(),
      totalExperts: a.integer().default(0),
      totalTimesheets: a.integer().default(0),
      totalActivityReports: a.integer().default(0),
      totalFiles: a.integer().default(0),
      status: a.string().default("draft"),
      notes: a.string(),
      monthlyReports: a.hasMany("MonthlyExpertReport", "importBatchId"),
      uploadedFiles: a.hasMany("UploadedReportingFile", "importBatchId"),
    })
    .secondaryIndexes((index) => [
      index("reportingYear"),
      index("status"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  MonthlyExpertReport: a
    .model({
      expertId: a.id().required(),
      expert: a.belongsTo("Expert", "expertId"),
      expertName: a.string().required(),
      projectCode: a.string().required(),
      projectTitle: a.string(),
      positionInProject: a.string(),
      reportingYear: a.integer().required(),
      reportingMonth: a.integer().required(),
      reportingMonthLabel: a.string(),
      sourceType: a.string().default("historical_import"),
      importBatchId: a.id(),
      importBatch: a.belongsTo("HistoricalImportBatch", "importBatchId"),
      activityReportFileId: a.id(),
      timesheetWorkbookFileId: a.id(),
      totalPeoHours: a.float().default(0),
      totalOtherHours: a.float(),
      leaveHours: a.float(),
      subactivities: a.string().array(),
      status: a.string().default("imported"),
      pmReviewStatus: a.string().default("not_reviewed"),
      pmReviewedBy: a.string(),
      pmReviewedAt: a.datetime(),
      pmObservations: a.string().array(),
      validationIssues: a.json(),
      createdBy: a.string().required(),
      updatedBy: a.string(),
      files: a.hasMany("UploadedReportingFile", "monthlyReportId"),
      activityItems: a.hasMany("MonthlyActivityItem", "monthlyReportId"),
      timesheetDays: a.hasMany("HistoricalTimesheetDayEntry", "monthlyReportId"),
    })
    .secondaryIndexes((index) => [
      index("expertId").sortKeys(["reportingYear", "reportingMonth"]),
      index("reportingYear").sortKeys(["reportingMonth"]),
      index("status"),
      index("importBatchId"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  UploadedReportingFile: a
    .model({
      expertId: a.id(),
      monthlyReportId: a.id(),
      monthlyReport: a.belongsTo("MonthlyExpertReport", "monthlyReportId"),
      importBatchId: a.id(),
      importBatch: a.belongsTo("HistoricalImportBatch", "importBatchId"),
      originalFileName: a.string().required(),
      storagePath: a.string().required(),
      s3Bucket: a.string(),
      s3Key: a.string(),
      fileType: a.string().required(),
      extension: a.string().required(),
      mimeType: a.string(),
      fileSize: a.integer(),
      reportingYear: a.integer(),
      reportingMonth: a.integer(),
      detectedExpertName: a.string(),
      detectedProjectCode: a.string(),
      uploadStatus: a.string().default("uploaded"),
      parsingStatus: a.string().default("not_parsed"),
      extractedMetadata: a.json(),
      checksum: a.string(),
      uploadedAt: a.datetime().required(),
      uploadedBy: a.string().required(),
    })
    .secondaryIndexes((index) => [
      index("expertId").sortKeys(["reportingYear", "reportingMonth"]),
      index("monthlyReportId"),
      index("importBatchId"),
      index("fileType"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  MonthlyActivityItem: a
    .model({
      monthlyReportId: a.id().required(),
      monthlyReport: a.belongsTo("MonthlyExpertReport", "monthlyReportId"),
      expertId: a.id().required(),
      activityNumber: a.string(),
      subactivityCode: a.string(),
      subactivityTitle: a.string(),
      activityTitle: a.string().required(),
      activityDescription: a.string(),
      resultDescription: a.string(),
      deliverableTitle: a.string(),
      isCommonDeliverable: a.boolean().default(false),
      collaborators: a.string().array(),
      hours: a.float().default(0),
      sourcePage: a.integer(),
      sourceFileId: a.id(),
    })
    .secondaryIndexes((index) => [
      index("monthlyReportId"),
      index("expertId"),
      index("subactivityCode"),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  HistoricalTimesheetDayEntry: a
    .model({
      monthlyReportId: a.id().required(),
      monthlyReport: a.belongsTo("MonthlyExpertReport", "monthlyReportId"),
      expertId: a.id().required(),
      date: a.date().required(),
      day: a.integer().required(),
      reportingMonth: a.integer().required(),
      reportingYear: a.integer().required(),
      hourlyRate: a.float(),
      peoHours: a.float().default(0),
      otherHours: a.float(),
      leaveCode: a.string(),
      activityCode: a.string(),
      subactivityCode: a.string(),
      activityTitle: a.string(),
      activityDescription: a.string(),
      source: a.string().default("historical_import"),
      sourceFileId: a.id(),
    })
    .secondaryIndexes((index) => [
      index("monthlyReportId").sortKeys(["date"]),
      index("expertId").sortKeys(["date"]),
      index("reportingYear").sortKeys(["reportingMonth"]),
    ])
    .authorization((allow) => [
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),

  AuditLog: a
    .model({
      actionType: a.string().required(),
      actorId: a.string().required(),
      actorName: a.string(),
      actorRole: a.string().required(),
      affectedExpertId: a.id(),
      affectedExpertName: a.string(),
      projectCode: a.string(),
      month: a.integer(),
      year: a.integer(),
      fieldName: a.string(),
      oldValue: a.string(),
      newValue: a.string(),
      justification: a.string(),
      source: a.string().required(),
    })
    .secondaryIndexes((index) => [
      index("affectedExpertId").sortKeys(["year", "month"]),
      index("actionType"),
    ])
    .authorization((allow) => [
      allow.groups(["pm"]).to(["create", "read"]),
      allow.groups(["admin"]).to(["create", "read", "update", "delete"]),
    ]),

  NotificationLog: a
    .model({
      kind: a.string().required(),
      recipientEmail: a.email().required(),
      subject: a.string().required(),
      body: a.string().required(),
      status: a.string().default("pending"),
      metadata: a.json(),
      sentAt: a.datetime(),
      errorMessage: a.string(),
    })
    .secondaryIndexes((index) => [index("kind"), index("recipientEmail")])
    .authorization((allow) => [
      allow.authenticated().to(["create"]),
      allow.groups(["pm", "admin"]).to(["create", "read", "update", "delete"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
