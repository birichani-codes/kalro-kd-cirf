const { read, write } = require('../store');

function ensureUpdate7Data() {
  try {
    const scenarios = read('operational_scenarios');
    let scenariosChanged = false;
    scenarios.forEach(s => {
      if (s.nist_alignment) { delete s.nist_alignment; scenariosChanged = true; }
      if (s.id === 'phishing-account') {
        const description = 'A KALRO user reports a phishing email, followed by repeated failed sign-ins, a successful login from an unfamiliar source, and suspicious mailbox changes.';
        if (s.description !== description) { s.description = description; scenariosChanged = true; }
        const observations = [
          '14 failed sign-in attempts were recorded before a successful login.',
          'The successful login originated from an unfamiliar external IP address and unrecognized browser.',
          'The user reported a suspicious account-verification email shortly before the login.',
          'A new mailbox forwarding rule and active unfamiliar session indicate possible persistence.'
        ];
        s.alert = { ...(s.alert||{}), observations };
        scenariosChanged = true;
      }
    });
    if (scenariosChanged) write('operational_scenarios', scenarios);

    const knowledge = read('knowledge');
    let entry = knowledge.find(k => k.id === 'k_phish_account');
    if (!entry) {
      entry = {
        id:'k_phish_account',
        title:'Phishing-Induced KALRO Account Compromise Response',
        knowledge_type:'playbook',
        content:'Use this playbook when a KALRO user reports phishing and there is evidence of unauthorized account access.',
        tags:['phishing','credential-compromise','email','account-security','kalro'],
        incident_id:null, contributor_id:'u2', station_id:'Headquarters', confidence_score:0.94,
        version:1, superseded_by:null, status:'active', use_count:0, last_used_at:null,
        created_at:new Date().toISOString(), structured_response:{}
      };
      knowledge.push(entry);
    }
    entry.structured_response = {
      ...(entry.structured_response||{}),
      containment_actions:[
        'Revoke all active sessions and refresh tokens for the affected account',
        'Temporarily disable or lock the affected account',
        'Remove unauthorized mailbox forwarding rules, delegates, or persistence settings',
        'Block the phishing sender, URL, and related indicators',
        'Preserve authentication and mailbox audit logs before further changes',
        'Search for other recipients of the same phishing message and identify additional affected users',
        'Review recent privilege, MFA, recovery-information, and password-reset changes',
        'Assess whether sensitive mailbox or connected-service data was accessed or exported'
      ],
      recovery_actions:[
        'Reset the user password using a verified administrator workflow',
        'Verify or re-register MFA and confirm recovery information has not been changed',
        'Confirm unauthorized forwarding rules, delegates, sessions, and persistence are removed',
        'Review sign-in, mailbox, and access logs for suspicious activity or data access',
        'Restore account access only after validation checks pass',
        'Notify the affected user of the recovery actions and required precautions',
        'Monitor the account for recurring suspicious activity for the defined observation period',
        'Confirm no other users remain affected by the same phishing campaign'
      ],
      success_criteria:[
        'No unauthorized active sessions remain',
        'Unauthorized forwarding rules, delegates, and persistence are removed',
        'Credentials, MFA, and recovery information are secured',
        'No further suspicious sign-ins occur during validation',
        'Potential data access has been reviewed and documented',
        'Other recipients of the same phishing campaign have been assessed'
      ],
      verification_checks:[
        'No unauthorized active sessions remain',
        'Unauthorized forwarding rules, delegates, and persistence are removed',
        'Credentials, MFA, and recovery information are secured',
        'No further suspicious sign-ins occur during validation',
        'Potential data access has been reviewed and documented',
        'Other recipients of the same phishing campaign have been assessed'
      ],
      escalation_conditions:[
        'Privileged or administrator account involved',
        'Multiple users appear compromised',
        'Sensitive data access or exfiltration is suspected',
        'Lateral movement is suspected',
        'Knowledge-guided containment is partial or unsuccessful'
      ]
    };
    delete entry.structured_response.nist_mapping;
    write('knowledge', knowledge);
  } catch (err) {
    console.error('[Update 7] Failed to refresh operational-testing seed data', err);
  }
}

module.exports = { ensureUpdate7Data };
