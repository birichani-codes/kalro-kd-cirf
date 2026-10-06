/**
 * GameTheoryAdvisor Component
 * Strategic decision support UI with Nash Equilibrium visualization
 */

import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function GameTheoryAdvisor({ incidentId, incidentSeverity, onRecommendation }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (incidentId) {
      fetchGameTheoryAnalysis();
    }
  }, [incidentId]);

  const fetchGameTheoryAnalysis = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/incidents/${incidentId}/calculate-game-theory`);
      setAnalysis(res.data);
      if (onRecommendation) {
        onRecommendation(res.data.nash_equilibrium);
      }
    } catch(err) {
      setError(err.response?.data?.error || 'Failed to calculate game theory');
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action) => {
    switch(action) {
      case 'isolate': return 'var(--kalro-red)';
      case 'monitor': return 'var(--yellow)';
      case 'hybrid': return 'var(--accent)';
      default: return 'var(--text3)';
    }
  };

  const getActionIcon = (action) => {
    switch(action) {
      case 'isolate': return '🔐';
      case 'monitor': return '👁️';
      case 'hybrid': return '⚖️';
      default: return '❓';
    }
  };

  if (loading) {
    return (
      <div style={{textAlign:'center',padding:32,color:'var(--text3)'}}>
        <div style={{fontSize:14,fontFamily:'var(--font-mono)'}}>Calculating Nash Equilibrium...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error" style={{margin:16}}>
        {error}
        <button onClick={fetchGameTheoryAnalysis} style={{marginLeft:12,fontSize:12,color:'inherit',textDecoration:'underline',background:'none',border:'none',cursor:'pointer'}}>
          Retry
        </button>
      </div>
    );
  }

  if (!analysis) return null;

  const payoff = analysis.payoff_matrix;
  const nash = analysis.nash_equilibrium;
  const recommendation = nash.recommendedAction;

  return (
    <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:24,marginTop:20}}>
      <h3 style={{fontFamily:'var(--font-mono)',fontSize:16,marginBottom:16,color:'var(--text)'}}>
        Strategic Decision Support
      </h3>

      {/* Recommended Action */}
      <div style={{background:getActionColor(recommendation)+'22',border:'2px solid '+getActionColor(recommendation),borderRadius:12,padding:20,marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
          <span style={{fontSize:32}}>{getActionIcon(recommendation)}</span>
          <div>
            <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:1}}>
              Recommended Action
            </div>
            <div style={{fontSize:20,fontWeight:700,color:getActionColor(recommendation),textTransform:'capitalize'}}>
              {recommendation}
            </div>
          </div>
          <div style={{marginLeft:'auto',textAlign:'right'}}>
            <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)'}}>CONFIDENCE</div>
            <div style={{fontSize:20,fontWeight:700,color:nash.confidence > 0.7 ? 'var(--kalro-green)' : nash.confidence > 0.5 ? 'var(--yellow)' : 'var(--kalro-red)'}}>
              {(nash.confidence * 100).toFixed(0)}%
            </div>
          </div>
        </div>
        <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
          {nash.reasoning}
        </div>
      </div>

      {/* Payoff Matrix Visualization */}
      <div style={{marginBottom:24}}>
        <h4 style={{fontSize:13,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>
          Payoff Matrix Analysis
        </h4>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {/* Isolate Strategy */}
          <div style={{background:'var(--bg3)',border:'1px solid var(--kalro-red)',borderRadius:8,padding:16}}>
            <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--kalro-red)',fontWeight:600,marginBottom:12,textTransform:'uppercase'}}>
              🔐 ISOLATE STRATEGY
            </div>
            
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4}}>Score</div>
              <div style={{fontSize:18,fontWeight:700,color:'var(--kalro-red)',fontFamily:'var(--font-mono)'}}>
                {nash.isolateScore.toFixed(2)}
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:11}}>
              <div>
                <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:2}}>Business Cost</div>
                <div style={{color:'var(--text)',fontWeight:600}}>${payoff.isolation.businessCost.toLocaleString()}</div>
              </div>
              <div>
                <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:2}}>Risk Reduction</div>
                <div style={{color:'var(--kalro-green)',fontWeight:600}}>{(payoff.isolation.riskReduction * 100).toFixed(0)}%</div>
              </div>
            </div>

            <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)',fontSize:11}}>
              <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:2}}>Knowledge Gain</div>
              <div style={{color:'var(--text)',fontWeight:600}}>{(payoff.isolation.knowledgeGain * 100).toFixed(0)}%</div>
            </div>

            <div style={{marginTop:12,padding:8,background:'var(--bg2)',borderRadius:4,fontSize:11,color:'var(--text3)'}}>
              <strong style={{color:'var(--text2)'}}>Impact:</strong> Eliminates threat immediately but high business cost
            </div>
          </div>

          {/* Monitor Strategy */}
          <div style={{background:'var(--bg3)',border:'1px solid var(--yellow)',borderRadius:8,padding:16}}>
            <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--yellow)',fontWeight:600,marginBottom:12,textTransform:'uppercase'}}>
              👁️ MONITOR STRATEGY
            </div>
            
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4}}>Score</div>
              <div style={{fontSize:18,fontWeight:700,color:'var(--yellow)',fontFamily:'var(--font-mono)'}}>
                {nash.monitorScore.toFixed(2)}
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:11}}>
              <div>
                <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:2}}>Business Cost</div>
                <div style={{color:'var(--text)',fontWeight:600}}>${payoff.monitoring.businessCost.toLocaleString()}</div>
              </div>
              <div>
                <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:2}}>Risk Reduction</div>
                <div style={{color:'var(--yellow)',fontWeight:600}}>{(payoff.monitoring.riskReduction * 100).toFixed(0)}%</div>
              </div>
            </div>

            <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)',fontSize:11}}>
              <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:2}}>Knowledge Gain</div>
              <div style={{color:'var(--text)',fontWeight:600}}>{(payoff.monitoring.knowledgeGain * 100).toFixed(0)}%</div>
            </div>

            <div style={{marginTop:12,padding:8,background:'var(--bg2)',borderRadius:4,fontSize:11,color:'var(--text3)'}}>
              <strong style={{color:'var(--text2)'}}>Impact:</strong> Lower cost but risk remains; maximum learning opportunity
            </div>
          </div>
        </div>
      </div>

      {/* Decision Metrics */}
      <div style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:16}}>
        <h4 style={{fontSize:13,fontFamily:'var(--font-mono)',color:'var(--text3)',marginBottom:12,textTransform:'uppercase',letterSpacing:1}}>
          Key Metrics
        </h4>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:12,fontSize:12}}>
          <div>
            <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4,fontSize:10}}>Attacker Gain</div>
            <div style={{fontSize:16,fontWeight:700,color:'var(--kalro-red)',fontFamily:'var(--font-mono)'}}>
              ${payoff.attackerGain.toLocaleString()}
            </div>
          </div>

          <div>
            <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4,fontSize:10}}>Defense Cost</div>
            <div style={{fontSize:16,fontWeight:700,color:'var(--accent)',fontFamily:'var(--font-mono)'}}>
              ${payoff.defenseCost.toLocaleString()}
            </div>
          </div>

          <div>
            <div style={{color:'var(--text3)',fontFamily:'var(--font-mono)',marginBottom:4,fontSize:10}}>Risk Appetite</div>
            <div style={{fontSize:16,fontWeight:700,fontFamily:'var(--font-mono)'}}>
              {(payoff.riskAppetite * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {/* Reasoning */}
      {recommendation === 'hybrid' && (
        <div style={{marginTop:16,padding:12,background:'var(--accent)'+
'22',border:'1px solid var(--accent)',borderRadius:8,fontSize:12,color:'var(--text2)',lineHeight:1.6}}>
          <strong style={{color:'var(--accent)'}}>💡 Hybrid Approach:</strong> This scenario suggests a phased response. Consider monitoring initially to gather intelligence, then escalate to isolation if the threat escalates. This balances risk and learning.
        </div>
      )}

      <button
        onClick={fetchGameTheoryAnalysis}
        style={{marginTop:16,padding:'8px 12px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,fontSize:12,fontFamily:'var(--font-mono)',color:'var(--text2)',cursor:'pointer',transition:'all 0.2s'}}
      >
        🔄 Recalculate with current data
      </button>
    </div>
  );
}
