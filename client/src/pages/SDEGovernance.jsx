/**
 * SDEGovernance Page
 * Super Admin configuration for Strategic Decision Engine parameters
 */

import { useState, useEffect } from 'react'
import api from '../api/axios'
import { Loading } from '../components/Shared'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function SDEGovernance() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    riskAppetite: 0.5,
    knowledgeConfidenceFactor: 0.8,
    stationMultipliers: {
      "Headquarters": 2.0,
      "Research Institute": 1.5,
      "Sub-Centre/Field Station": 1.0
    },
    attackerProfiles: {
      "Script Kiddie": 0.2,
      "Cyber Criminal": 0.5,
      "State Actor": 0.9
    },
    socialFrictionPenalty: 1000,
    hourlyBusinessCost: 500,
    expectedImpactDuration: 2
  });

  // Authorization check
  useEffect(() => {
    if (user?.role !== 'super_admin') {
      navigate('/');
      return;
    }

    fetchConfig();
  }, [user, navigate]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await api.get('/sde/settings');
      setConfig(res.data);
      setFormData(res.data);
    } catch(err) {
      setError('Failed to load SDE configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    if (field.startsWith('stationMultipliers.')) {
      const key = field.split('.')[1];
      setFormData(prev => ({
        ...prev,
        stationMultipliers: {
          ...prev.stationMultipliers,
          [key]: parseFloat(value)
        }
      }));
    } else if (field.startsWith('attackerProfiles.')) {
      const key = field.split('.')[1];
      setFormData(prev => ({
        ...prev,
        attackerProfiles: {
          ...prev.attackerProfiles,
          [key]: parseFloat(value)
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: ['riskAppetite', 'knowledgeConfidenceFactor'].includes(field) ? parseFloat(value) : parseFloat(value) || parseInt(value)
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      await api.put('/sde/settings', formData);
      setSuccess('SDE Configuration saved successfully!');
      setConfig(formData);
      setTimeout(() => setSuccess(''), 3000);
    } catch(err) {
      setError(err.response?.data?.error || 'Failed to save SDE configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  const riskAppetiteDescriptions = {
    0.0: 'Conservative: Biases toward Isolation (Containment-focused)',
    0.5: 'Balanced: Equal consideration of risk and business impact',
    1.0: 'Aggressive: Biases toward Monitoring (Learning-focused)'
  };

  const knowledgeConfidenceDescriptions = {
    0.0: 'Low Confidence: High perceived risk, prefers isolation',
    0.5: 'Moderate Confidence: Balanced trust in routines',
    1.0: 'High Confidence: Low perceived risk, trusts institutional memory'
  };

  return (
    <div style={{padding:20,maxWidth:1000}}>
      {/* Header */}
      <div style={{marginBottom:32}}>
        <h1 style={{fontFamily:'var(--font-mono)',fontSize:28,marginBottom:8,color:'var(--text)'}}>
          Strategic Decision Engine (SDE) Governance
        </h1>
        <p style={{color:'var(--text3)',fontSize:14}}>
          Central Brain for defining mathematical weights and strategic priorities (Super Admin Only)
        </p>
      </div>

      {error && <div className="alert alert-error" style={{marginBottom:16}}>{error}</div>}
      {success && <div className="alert alert-success" style={{marginBottom:16}}>{success}</div>}

      <form onSubmit={handleSubmit}>
        {/* Global Risk & Knowledge Weights */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24,marginBottom:24}}>
          <h3 style={{fontSize:18,fontFamily:'var(--font-mono)',color:'var(--text)',marginBottom:20}}>
            Global Risk & Knowledge Weights
          </h3>

          {/* Risk Appetite */}
          <div style={{marginBottom:32}}>
            <label style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)',display:'block',marginBottom:12}}>
              RISK APPETITE (0.0 - 1.0)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={formData.riskAppetite}
              onChange={(e) => handleChange('riskAppetite', e.target.value)}
              style={{width:'100%',height:6,borderRadius:3,background:'var(--bg3)',outline:'none',WebkitAppearance:'none',cursor:'pointer'}}
            />
            <style>{`
              input[type="range"]::-webkit-slider-thumb {
                appearance: none;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: var(--kalro-green);
                cursor: pointer;
              }
              input[type="range"]::-moz-range-thumb {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: var(--kalro-green);
                border: none;
                cursor: pointer;
              }
            `}</style>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',marginTop:8}}>
              <span>Conservative (0.0)</span>
              <span style={{fontWeight:700,fontSize:12,color:'var(--text)',background:'var(--bg3)',padding:'4px 8px',borderRadius:4}}>
                {formData.riskAppetite.toFixed(1)}
              </span>
              <span>Aggressive (1.0)</span>
            </div>
            <p style={{fontSize:12,color:'var(--text3)',marginTop:8}}>
              {riskAppetiteDescriptions[formData.riskAppetite] || 'Balanced approach'}
            </p>
          </div>

          {/* Knowledge Confidence Factor */}
          <div style={{marginBottom:24}}>
            <label style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)',display:'block',marginBottom:12}}>
              KNOWLEDGE CONFIDENCE FACTOR (0.0 - 1.0)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={formData.knowledgeConfidenceFactor}
              onChange={(e) => handleChange('knowledgeConfidenceFactor', e.target.value)}
              style={{width:'100%',height:6,borderRadius:3,background:'var(--bg3)',outline:'none',WebkitAppearance:'none',cursor:'pointer'}}
            />
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',marginTop:8}}>
              <span>Low (0.0)</span>
              <span style={{fontWeight:700,fontSize:12,color:'var(--text)',background:'var(--bg3)',padding:'4px 8px',borderRadius:4}}>
                {formData.knowledgeConfidenceFactor.toFixed(1)}
              </span>
              <span>High (1.0)</span>
            </div>
            <p style={{fontSize:12,color:'var(--text3)',marginTop:8}}>
              {knowledgeConfidenceDescriptions[formData.knowledgeConfidenceFactor] || 'Moderate confidence'}
            </p>
          </div>
        </div>

        {/* Decentralized Station Criticality */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24,marginBottom:24}}>
          <h3 style={{fontSize:18,fontFamily:'var(--font-mono)',color:'var(--text)',marginBottom:20}}>
            Decentralized Station Criticality
          </h3>
          <p style={{color:'var(--text3)',fontSize:14,marginBottom:16}}>
            Station Multipliers: Weight applied to Hourly Business Cost based on station role
          </p>

          {Object.entries(formData.stationMultipliers).map(([station, multiplier]) => (
            <div key={station} style={{marginBottom:16}}>
              <label style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)',display:'block',marginBottom:8}}>
                {station} Multiplier
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={multiplier}
                onChange={(e) => handleChange(`stationMultipliers.${station}`, e.target.value)}
                style={{width:'100%',padding:'8px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius)',background:'var(--bg)',color:'var(--text)',fontSize:14}}
              />
            </div>
          ))}
        </div>

        {/* Adversarial Modeling */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24,marginBottom:24}}>
          <h3 style={{fontSize:18,fontFamily:'var(--font-mono)',color:'var(--text)',marginBottom:20}}>
            Adversarial Modeling (Attacker Profiles)
          </h3>
          <p style={{color:'var(--text3)',fontSize:14,marginBottom:16}}>
            Risk Weights for different attacker types (higher = more dangerous)
          </p>

          {Object.entries(formData.attackerProfiles).map(([attacker, weight]) => (
            <div key={attacker} style={{marginBottom:16}}>
              <label style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)',display:'block',marginBottom:8}}>
                {attacker} Risk Weight
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={weight}
                onChange={(e) => handleChange(`attackerProfiles.${attacker}`, e.target.value)}
                style={{width:'100%',padding:'8px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius)',background:'var(--bg)',color:'var(--text)',fontSize:14}}
              />
            </div>
          ))}
        </div>

        {/* Economic & Socio-Technical Impact */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24,marginBottom:24}}>
          <h3 style={{fontSize:18,fontFamily:'var(--font-mono)',color:'var(--text)',marginBottom:20}}>
            Economic & Socio-Technical Impact
          </h3>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div>
              <label style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)',display:'block',marginBottom:8}}>
                Hourly Business Cost ($)
              </label>
              <input
                type="number"
                min="0"
                value={formData.hourlyBusinessCost}
                onChange={(e) => handleChange('hourlyBusinessCost', e.target.value)}
                style={{width:'100%',padding:'8px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius)',background:'var(--bg)',color:'var(--text)',fontSize:14}}
              />
            </div>

            <div>
              <label style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)',display:'block',marginBottom:8}}>
                Expected Impact Duration (Hrs)
              </label>
              <input
                type="number"
                min="0"
                value={formData.expectedImpactDuration}
                onChange={(e) => handleChange('expectedImpactDuration', e.target.value)}
                style={{width:'100%',padding:'8px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius)',background:'var(--bg)',color:'var(--text)',fontSize:14}}
              />
            </div>

            <div style={{gridColumn:'span 2'}}>
              <label style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)',display:'block',marginBottom:8}}>
                Social Friction Penalty ($)
              </label>
              <input
                type="number"
                min="0"
                value={formData.socialFrictionPenalty}
                onChange={(e) => handleChange('socialFrictionPenalty', e.target.value)}
                style={{width:'100%',padding:'8px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius)',background:'var(--bg)',color:'var(--text)',fontSize:14}}
              />
              <p style={{fontSize:12,color:'var(--text3)',marginTop:4}}>
                Estimated cost of Socio-Technical disruption (employee productivity loss and research stoppage)
              </p>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div style={{textAlign:'right'}}>
          <button
            type="submit"
            disabled={saving}
            style={{
              background:'var(--kalro-green)',
              color:'white',
              border:'none',
              padding:'12px 24px',
              borderRadius:'var(--radius)',
              fontSize:14,
              fontWeight:600,
              cursor:saving?'not-allowed':'pointer',
              opacity:saving?0.6:1
            }}
          >
            {saving ? 'Saving...' : 'Save SDE Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}