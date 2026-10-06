const { read, write } = require('../store');

const USER_STATIONS = {
  u1: 'Headquarters',
  u2: 'Muguga',
  u3: 'Muguga',
  u4: 'Kiboko'
};

function ensureUpdate9Data() {
  try {
    const stations = read('stations');
    const valid = new Set(stations.filter(s => s.active !== false).map(s => s.name));
    const users = read('users');
    let usersChanged = false;
    users.forEach(u => {
      if ((!u.station_id || u.station_id === 'Site A') && USER_STATIONS[u.id] && valid.has(USER_STATIONS[u.id])) {
        u.station_id = USER_STATIONS[u.id];
        usersChanged = true;
      }
    });
    if (usersChanged) write('users', users);

    const knowledge = read('knowledge');
    const phishing = knowledge.find(k => k.id === 'k_phish_account');
    if (phishing && (!phishing.station_id || phishing.station_id === 'Site A')) {
      phishing.station_id = 'Muguga';
      write('knowledge', knowledge);
    }
  } catch (err) {
    console.error('[Update 9] Failed to refresh practical station data', err);
  }
}

module.exports = { ensureUpdate9Data };
