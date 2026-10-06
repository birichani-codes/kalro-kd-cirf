/**
 * SocioTechnicalTagger Component
 * UI for tagging incidents with Socio-Technical dimensions
 */

import { useState } from 'react'
import api from '../api/axios'

export const STS_DIMENSIONS = {
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

const RESOLUTION_TYPES = [
  { value: 'patch', label: 'Patch/Fix', icon: '🔧' },
  { value: 'training', label: 'Training', icon: '📚' },
  { value: 'policy', label: 'Policy', icon: '📋' },
  { value: 'infrastructure', label: 'Infrastructure', icon: '🏗️' },
  { value: 'hybrid', label: 'Hybrid', icon: '⚖️' }
];

export default function SocioTechnicalTagger({ incidentId, onSave, initialData = {} }) {
  const [technicalFactors, setTechnicalFactors] = useState(initialData.technical_factors || []);
  const [socialFactors, setSocialFactors] = useState(initialData.social_factors || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleFactor = (factor, type) => {
    if (type === 'technical') {
      setTechnicalFactors(prev =>
        prev.includes(factor) ? prev.filter(f => f !== factor) : [...prev, factor]
      );
    } else {
      setSocialFactors(prev =>
        prev.includes(factor) ? prev.filter(f => f !== factor) : [...prev, factor]
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post(`/incidents/${incidentId}/tag-socio-technical`, {
        technical_factors: technicalFactors,
        social_factors: socialFactors
      });

      if (onSave) {
        onSave({ technical_factors: technicalFactors, social_factors: socialFactors });
      }
    } catch(err) {
      setError(err.response?.data?.error || 'Failed to save STS analysis');
    } finally {
      setLoading(false);
    }
  };

  const techScore = (technicalFactors.length / STS_DIMENSIONS.technical.length) * 0.4;
  const socialScore = (socialFactors.length / STS_DIMENSIONS.social.length) * 0.6;
  const stsRiskScore = ((techScore + socialScore) * 100).toFixed(1);

  const rootCauseType = technicalFactors.length > socialFactors.length ? 'technical' :
                        socialFactors.length > technicalFactors.length ? 'social' : 'hybrid';

  const recommendedResolution = rootCauseType === 'technical' ? 'patch' :
                               rootCauseType === 'social' ? 'training' : 'hybrid';

  return (
    <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24}}>
      <h3 style={{fontFamily:'var(--font-mono)',fontSize:16,marginBottom:16,color:'var(--text)'}}>
        Socio-Technical Analysis
      </h3>

      {error && <div className="alert alert-error" style={{marginBottom:16}}>{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* STS Risk Score Display */}
        <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:16,marginBottom:20}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <div>
              <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4}}>STS RISK SCORE</div>
              <div style={{fontSize:24,fontWeight:700,color:stsRiskScore > 60 ? 'var(--kalro-red)' : stsRiskScore > 40 ? 'var(--yellow)' : 'var(--kalro-green)',fontFamily:'var(--font-mono)'}}>
                {stsRiskScore}
              </div>
            </div>
            <div>
              <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4}}>ROOT CAUSE TYPE</div>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>
                <span style={{
                  background: rootCauseType === 'technical' ? 'rgba(66, 165, 245, 0.2)' :
                             rootCauseType === 'social' ? 'rgba(255, 167, 38, 0.2)' : 'rgba(171, 71, 188, 0.2)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  textTransform: 'capitalize'
                }}>
                  {rootCauseType}
                </span>
              </div>
            </div>
            <div>
              <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4}}>RECOMMENDED RESOLUTION</div>
              <div style={{fontSize:14,fontWeight:600}}>
                {RESOLUTION_TYPES.find(r => r.value === recommendedResolution)?.icon} {RESOLUTION_TYPES.find(r => r.value === recommendedResolution)?.label}
              </div>
            </div>
          </div>
        </div>

        {/* Technical Factors */}
        <div style={{marginBottom:24}}>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)',display:'block',marginBottom:12}}>
            TECHNICAL FACTORS (Weight: 40%)
          </label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))',gap:8}}>
            {STS_DIMENSIONS.technical.map(factor => (
              <button
                key={factor}
                type="button"
                onClick={() => toggleFactor(factor, 'technical')}
                style={{
                  padding: '10px 12px',
                  background: technicalFactors.includes(factor) ? 'var(--kalro-green)' : 'var(--bg3)',
                  border: technicalFactors.includes(factor) ? '2px solid var(--kalro-green-light)' : '1px solid var(--border)',
                  borderRadius: 6,
                  color: technicalFactors.includes(factor) ? 'white' : 'var(--text2)',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {technicalFactors.includes(factor) && '✓ '}{factor.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:8}}>
            Selected: {technicalFactors.length} / {STS_DIMENSIONS.technical.length}
          </div>
        </div>

        {/* Social Factors */}
        <div style={{marginBottom:24}}>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)',display:'block',marginBottom:12}}>
            SOCIAL FACTORS (Weight: 60%)
          </label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))',gap:8}}>
            {STS_DIMENSIONS.social.map(factor => (
              <button
                key={factor}
                type="button"
                onClick={() => toggleFactor(factor, 'social')}
                style={{
                  padding: '10px 12px',
                  background: socialFactors.includes(factor) ? 'var(--accent)' : 'var(--bg3)',
                  border: socialFactors.includes(factor) ? '2px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 6,
                  color: socialFactors.includes(factor) ? 'white' : 'var(--text2)',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {socialFactors.includes(factor) && '✓ '}{factor.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:8}}>
            Selected: {socialFactors.length} / {STS_DIMENSIONS.social.length}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || (technicalFactors.length === 0 && socialFactors.length === 0)}
          className="btn btn-primary"
          style={{width:'100%'}}
        >
          {loading ? 'Saving...' : 'Save STS Analysis'}
        </button>
      </form>

      {/* SLA Adjustment Info */}
      {stsRiskScore > 0 && (
        <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:12,marginTop:16,fontSize:11,color:'var(--text3)'}}>
          <strong style={{color:'var(--text2)'}}>SLA Adjustment:</strong> STS Risk Score of {stsRiskScore} will extend SLA by ~{
            stsRiskScore < 20 ? '0%' : stsRiskScore < 40 ? '15%' : stsRiskScore < 60 ? '35%' : stsRiskScore < 80 ? '60%' : '100%'
          }
        </div>
      )}
    </div>
  );
}
