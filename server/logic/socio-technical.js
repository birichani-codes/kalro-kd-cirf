/**
 * Socio-Technical Systems (STS) Analysis Engine
 * Classifies incidents into technical vs social factors
 * for joint optimization of response strategies
 */

const { read, write } = require('../store');

/**
 * Socio-Technical Dimensions
 */
const STS_DIMENSIONS = {
  technical: [
    'infrastructure_failure',
    'unpatched_vulnerability',
    'software_bug',
    'misconfiguration',
    'hardware_degradation',
    'network_latency',
    'storage_issues',
    'database_corruption'
  ],
  social: [
    'training_gap',
    'policy_gap',
    'process_bottleneck',
    'communication_failure',
    'lack_of_documentation',
    'negligent_user_action',
    'institutional_resistance',
    'resource_constraint'
  ]
};

/**
 * Analyze incident for STS factors
 * Returns structured analysis with root cause classification
 */
function analyzeIncident(incident, suggestedFactors = {}) {
  const technicalFactors = suggestedFactors.technical_factors || [];
  const socialFactors = suggestedFactors.social_factors || [];

  // Calculate STS Risk Score
  const techScore = (technicalFactors.length / STS_DIMENSIONS.technical.length) * 0.4;
  const socialScore = (socialFactors.length / STS_DIMENSIONS.social.length) * 0.6;
  const stsRiskScore = (techScore + socialScore) * 100;

  // Determine root cause type
  let rootCauseType = 'hybrid';
  if (technicalFactors.length > socialFactors.length) {
    rootCauseType = 'technical';
  } else if (socialFactors.length > technicalFactors.length) {
    rootCauseType = 'social';
  }

  return {
    technical_factors: technicalFactors,
    social_factors: socialFactors,
    root_cause_type: rootCauseType,
    sts_risk_score: Math.round(stsRiskScore * 100) / 100,
    technical_severity: calculateFactor(technicalFactors),
    social_severity: calculateFactor(socialFactors),
    recommended_resolution_type: recommendResolutionType(rootCauseType, technicalFactors, socialFactors),
    sla_adjustment_multiplier: calculateSlaAdjustment(stsRiskScore)
  };
}

/**
 * Calculate severity of factors (low, medium, high)
 */
function calculateFactor(factors) {
  if (factors.length === 0) return 'none';
  if (factors.length <= 2) return 'low';
  if (factors.length <= 4) return 'medium';
  return 'high';
}

/**
 * Recommend resolution type based on root cause
 */
function recommendResolutionType(rootCauseType, technicalFactors, socialFactors) {
  if (rootCauseType === 'technical') {
    // Check for specific technical issues
    if (technicalFactors.includes('unpatched_vulnerability') || technicalFactors.includes('misconfiguration')) {
      return 'patch';
    }
    return 'infrastructure';
  } else if (rootCauseType === 'social') {
    // Social issues need training or policy fixes
    if (socialFactors.includes('training_gap') || socialFactors.includes('negligent_user_action')) {
      return 'training';
    }
    return 'policy';
  } else {
    // Hybrid: address both
    return 'hybrid';
  }
}

/**
 * Calculate SLA adjustment based on STS complexity
 * More socio-technical complexity = longer SLA
 */
function calculateSlaAdjustment(stsRiskScore) {
  if (stsRiskScore < 20) return 1.0;
  if (stsRiskScore < 40) return 1.15;
  if (stsRiskScore < 60) return 1.35;
  if (stsRiskScore < 80) return 1.60;
  return 2.0; // Complex hybrid issues need more time
}

/**
 * Create institutional enablers (policies/infrastructure improvements)
 */
function createInstitutionalEnabler(enabler) {
  const enablers = read('institutional-enablers') || [];
  
  const newEnabler = {
    id: 'ie' + Math.random().toString(36).slice(2, 9),
    category: enabler.category, // 'policy', 'infrastructure', 'training', 'process'
    title: enabler.title,
    description: enabler.description,
    addresses_factor: enabler.addresses_factor, // Which STS factor this addresses
    implementation_status: 'proposed', // proposed, in-progress, implemented
    related_incidents: enabler.related_incidents || [],
    created_at: new Date().toISOString(),
    implemented_at: null,
    impact_metric: null
  };

  enablers.push(newEnabler);
  write('institutional-enablers', enablers);
  return newEnabler;
}

/**
 * Tag incident with STS analysis
 */
function tagIncidentSTS(incidentId, stsAnalysis) {
  const incidents = read('incidents');
  const incident = incidents.find(i => i.id === incidentId);
  
  if (!incident) throw new Error('Incident not found');

  incident.socio_technical = stsAnalysis;
  
  // Adjust SLA if needed
  const originalSlaDeadline = new Date(incident.sla_deadline);
  const adjustmentMultiplier = stsAnalysis.sla_adjustment_multiplier;
  const adjustedDeadline = new Date(originalSlaDeadline.getTime() * adjustmentMultiplier);
  
  incident.sla_deadline_original = incident.sla_deadline;
  incident.sla_deadline = adjustedDeadline.toISOString();
  incident.sla_adjustment_reason = `STS Risk Score: ${stsAnalysis.sts_risk_score} (${stsAnalysis.root_cause_type})`;
  
  write('incidents', incidents);
  return incident;
}

/**
 * Generate organizational resilience report
 */
function generateResiliencyReport() {
  const incidents = read('incidents');
  const enablers = read('institutional-enablers') || [];

  // Analyze patterns
  const techicalOnlyCount = incidents.filter(i => 
    i.socio_technical?.root_cause_type === 'technical'
  ).length;

  const socialOnlyCount = incidents.filter(i => 
    i.socio_technical?.root_cause_type === 'social'
  ).length;

  const hybridCount = incidents.filter(i => 
    i.socio_technical?.root_cause_type === 'hybrid'
  ).length;

  // Most common factors
  const allTechFactors = incidents.flatMap(i => i.socio_technical?.technical_factors || []);
  const allSocialFactors = incidents.flatMap(i => i.socio_technical?.social_factors || []);

  const techFactorFrequency = {};
  const socialFactorFrequency = {};

  allTechFactors.forEach(f => {
    techFactorFrequency[f] = (techFactorFrequency[f] || 0) + 1;
  });

  allSocialFactors.forEach(f => {
    socialFactorFrequency[f] = (socialFactorFrequency[f] || 0) + 1;
  });

  const topTechFactors = Object.entries(techFactorFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const topSocialFactors = Object.entries(socialFactorFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return {
    total_incidents_analyzed: incidents.filter(i => i.socio_technical).length,
    breakdown: {
      technical_only: techicalOnlyCount,
      social_only: socialOnlyCount,
      hybrid: hybridCount
    },
    top_technical_factors: topTechFactors.map(([factor, count]) => ({ factor, count })),
    top_social_factors: topSocialFactors.map(([factor, count]) => ({ factor, count })),
    institutional_enablers: {
      proposed: enablers.filter(e => e.implementation_status === 'proposed').length,
      in_progress: enablers.filter(e => e.implementation_status === 'in-progress').length,
      implemented: enablers.filter(e => e.implementation_status === 'implemented').length
    },
    recommendations: generateRecommendations(topTechFactors, topSocialFactors)
  };
}

/**
 * Generate recommendations based on patterns
 */
function generateRecommendations(topTechFactors, topSocialFactors) {
  const recommendations = [];

  if (topTechFactors.length > 0 && topTechFactors[0][1] >= 3) {
    recommendations.push({
      type: 'technical',
      factor: topTechFactors[0][0],
      action: `Implement infrastructure improvement for recurring issue: ${topTechFactors[0][0]}`,
      priority: 'high'
    });
  }

  if (topSocialFactors.length > 0 && topSocialFactors[0][1] >= 3) {
    recommendations.push({
      type: 'social',
      factor: topSocialFactors[0][0],
      action: `Launch training or policy initiative addressing: ${topSocialFactors[0][0]}`,
      priority: 'high'
    });
  }

  if (topTechFactors.length > 0 && topSocialFactors.length > 0) {
    recommendations.push({
      type: 'governance',
      action: 'Establish Joint Optimization Council to address hybrid incidents',
      priority: 'medium'
    });
  }

  return recommendations;
}

module.exports = {
  STS_DIMENSIONS,
  analyzeIncident,
  tagIncidentSTS,
  createInstitutionalEnabler,
  generateResiliencyReport
};
