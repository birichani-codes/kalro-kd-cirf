/**
 * GameTheoryConfig Page
 * Super Admin configuration for game theory parameters and risk appetite
 */

import { useState, useEffect } from 'react'
import api from '../api/axios'
import { Loading } from '../components/Shared'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function GameTheoryConfig() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    riskAppetite: 0.5,
    businessImpactHours: 8,
    hourlyBusinessCost: 500,
    isolationCost: 4000,
    monitoringCost: 100
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
      const res = await api.get('/game-theory/config');
      setConfig(res.data);
      setFormData(res.data);
    } catch(err) {
      setError('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'riskAppetite' ? parseFloat(value) : parseInt(value)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      await api.post('/game-theory/config', formData);
      setSuccess('Configuration saved successfully!');
      setConfig(formData);
      setTimeout(() => setSuccess(''), 3000);
    } catch(err) {
      setError(err.response?.data?.error || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  const riskAppetiteDescriptions = {
    0.2: 'Very Conservative - Prioritize risk elimination over business continuity',
    0.4: 'Conservative - Emphasize isolation and containment',
    0.5: 'Balanced - Equal weight to risk and business impact',
    0.7: 'Aggressive - Monitor more to maintain business operations',
    0.9: 'Very Aggressive - Minimize business disruption, accept higher risk'
  };

  return (
    <div style={{padding:20,maxWidth:900}}>
      {/* Header */}
      <div style={{marginBottom:32}}>
        <h1 style={{fontFamily:'var(--font-mono)',fontSize:28,marginBottom:8,color:'var(--text)'}}>
          Game Theory Configuration
        </h1>
        <p style={{color:'var(--text3)',fontSize:14}}>
          Strategic parameters for incident response decision support (Super Admin Only)
        </p>
      </div>

      {error && <div className="alert alert-error" style={{marginBottom:16}}>{error}</div>}
      {success && <div className="alert alert-success" style={{marginBottom:16}}>{success}</div>}

      <form onSubmit={handleSubmit}>
        {/* Risk Appetite Slider */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24,marginBottom:24}}>
          <h3 style={{fontSize:16,fontFamily:'var(--font-mono)',color:'var(--text)',marginBottom:20}}>
            Risk Appetite Configuration
          </h3>

          <div style={{marginBottom:24}}>
            <label style={{fontSize:13,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)',display:'block',marginBottom:12}}>
              RISK APPETITE LEVEL
            </label>

            <div style={{marginBottom:16}}>
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
            </div>

            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:16}}>
              <span>Very Conservative</span>
              <span style={{fontWeight:700,fontSize:12,color:'var(--text)',background:'var(--bg3)',padding:'4px 8px',borderRadius:4}}>
                {(formData.riskAppetite * 100).toFixed(0)}%
              </span>
              <span>Very Aggressive</span>
            </div>

            <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:12,fontSize:12,color:'var(--text2)',lineHeight:1.6}}>
              <strong style={{color:'var(--text)'}}>Current Setting:</strong> {riskAppetiteDescriptions[Math.round(formData.riskAppetite * 10) / 10] || 'Custom value'}
            </div>
          </div>

          {/* Risk Appetite Explanation */}
          <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:12,fontSize:11,color:'var(--text3)',lineHeight:1.8}}>
            <strong style={{color:'var(--text)'}}>📊 Impact:</strong> Risk appetite influences the Nash Equilibrium calculation. Higher values favor monitoring strategies (learning-oriented), while lower values favor isolation (containment-oriented).
          </div>
        </div>

        {/* Business Impact Parameters */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24,marginBottom:24}}>
          <h3 style={{fontSize:16,fontFamily:'var(--font-mono)',color:'var(--text)',marginBottom:20}}>
            Business Impact Parameters
          </h3>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            {/* Hourly Business Cost */}
            <div className="form-group">
              <label className="form-label">Hourly Business Cost ($)</label>
              <input
                type="number"
                value={formData.hourlyBusinessCost}
                onChange={(e) => handleChange('hourlyBusinessCost', e.target.value)}
                placeholder="500"
                min="0"
                step="100"
              />
              <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>
                Cost per hour of system downtime for isolation strategy
              </div>
            </div>

            {/* Business Impact Hours */}
            <div className="form-group">
              <label className="form-label">Expected Impact Duration (Hours)</label>
              <input
                type="number"
                value={formData.businessImpactHours}
                onChange={(e) => handleChange('businessImpactHours', e.target.value)}
                placeholder="8"
                min="1"
                step="1"
              />
              <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>
                Estimated hours of downtime if isolated
              </div>
            </div>

            {/* Isolation Cost */}
            <div className="form-group">
              <label className="form-label">Isolation Strategy Cost ($)</label>
              <input
                type="number"
                value={formData.isolationCost}
                onChange={(e) => handleChange('isolationCost', e.target.value)}
                placeholder="4000"
                min="0"
                step="100"
              />
              <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>
                Total cost of immediate isolation (business hours + operational cost)
              </div>
            </div>

            {/* Monitoring Cost */}
            <div className="form-group">
              <label className="form-label">Monitoring Strategy Cost ($)</label>
              <input
                type="number"
                value={formData.monitoringCost}
                onChange={(e) => handleChange('monitoringCost', e.target.value)}
                placeholder="100"
                min="0"
                step="10"
              />
              <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>
                Cost of monitoring infrastructure and analyst time
              </div>
            </div>
          </div>

          {/* Cost Comparison */}
          <div style={{marginTop:20,padding:12,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,fontSize:11,color:'var(--text2)'}}>
            <strong style={{color:'var(--text)'}}>💰 Cost Analysis:</strong>
            <div style={{marginTop:8}}>
              Isolation: ${formData.isolationCost.toLocaleString()} vs Monitoring: ${formData.monitoringCost.toLocaleString()} (Cost Difference: ${(formData.isolationCost - formData.monitoringCost).toLocaleString()})
            </div>
          </div>
        </div>

        {/* Impact Summary */}
        <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24,marginBottom:24}}>
          <h3 style={{fontSize:14,fontFamily:'var(--font-mono)',color:'var(--text)',marginBottom:12}}>
            Configuration Impact Summary
          </h3>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',gap:12,fontSize:12}}>
            <div style={{background:'var(--bg2)',padding:12,borderRadius:6}}>
              <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',fontSize:10,marginBottom:4}}>Total Isolation Cost</div>
              <div style={{fontSize:16,fontWeight:700,color:'var(--kalro-red)',fontFamily:'var(--font-mono)'}}>
                ${formData.isolationCost.toLocaleString()}
              </div>
            </div>

            <div style={{background:'var(--bg2)',padding:12,borderRadius:6}}>
              <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',fontSize:10,marginBottom:4}}>Monitoring Cost</div>
              <div style={{fontSize:16,fontWeight:700,color:'var(--yellow)',fontFamily:'var(--font-mono)'}}>
                ${formData.monitoringCost.toLocaleString()}
              </div>
            </div>

            <div style={{background:'var(--bg2)',padding:12,borderRadius:6}}>
              <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',fontSize:10,marginBottom:4}}>Risk Appetite</div>
              <div style={{fontSize:16,fontWeight:700,color:'var(--accent)',fontFamily:'var(--font-mono)'}}>
                {(formData.riskAppetite * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          <div style={{marginTop:12,padding:12,background:'var(--bg2)',borderRadius:6,fontSize:11,color:'var(--text3)'}}>
            These parameters are used in the Nash Equilibrium calculation to recommend whether to "Isolate" or "Monitor" an incident based on the strategic payoff for KALRO vs. attacker.
          </div>
        </div>

        {/* Governance Note */}
        <div style={{background:'var(--kalro-green)'+' 11',border:'1px solid var(--kalro-green)',borderRadius:'var(--radius-lg)',padding:16,marginBottom:24,fontSize:12,color:'var(--text2)',lineHeight:1.6}}>
          <strong style={{color:'var(--kalro-green)'}}>🔐 Governance Note:</strong> These configuration changes impact strategic decisions across all incidents. Changes take effect immediately. Recommend reviewing at quarterly governance meetings and documenting rationale for any adjustments to risk appetite.
        </div>

        {/* Save Button */}
        <div style={{display:'flex',gap:12}}>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{flex:1}}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button
            type="button"
            onClick={() => setFormData(config || {})}
            disabled={saving}
            className="btn"
            style={{flex:1,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text2)'}}
          >
            Reset to Saved
          </button>
        </div>
      </form>

      {/* Documentation */}
      <div style={{marginTop:40,padding:20,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)'}}>
        <h4 style={{fontSize:14,fontFamily:'var(--font-mono)',color:'var(--text)',marginBottom:12}}>
          📚 Configuration Guide
        </h4>

        <div style={{display:'grid',gap:12,fontSize:12,color:'var(--text2)',lineHeight:1.8}}>
          <div>
            <strong style={{color:'var(--text)'}}>Risk Appetite:</strong> Ranges from 0 (very conservative) to 1 (very aggressive). Influences the weighting of risk reduction vs. business continuity in strategy recommendations.
          </div>

          <div>
            <strong style={{color:'var(--text)'}}>Business Impact Hours:</strong> How long you estimate a critical system would be unavailable during isolation. Used to calculate the total business cost.
          </div>

          <div>
            <strong style={{color:'var(--text)'}}>Hourly Business Cost:</strong> The dollar cost per hour of downtime. Multiplied by Business Impact Hours to get total isolation cost.
          </div>

          <div>
            <strong style={{color:'var(--text)'}}>Isolation Strategy Cost:</strong> The complete economic cost of immediately isolating a system (includes hourly costs + operational overhead).
          </div>

          <div>
            <strong style={{color:'var(--text)'}}>Monitoring Strategy Cost:</strong> The cost to continuously monitor a suspect system without isolation (includes SIEM, analyst time, etc.).
          </div>
        </div>
      </div>
    </div>
  );
}
