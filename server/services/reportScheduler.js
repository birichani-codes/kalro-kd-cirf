const { read } = require('../store');
const gameTheory = require('../logic/game-theory');
const socioTechnical = require('../logic/socio-technical');
const email = require('../logic/email');

const REPORT_CRON = process.env.REPORT_CRON || '0 8 * * *'; // default every day at 08:00
const REPORT_TIME_HOUR = process.env.REPORT_HOUR ? parseInt(process.env.REPORT_HOUR, 10) : 8;

let cronAvailable = true;
let cron = null;
try {
  cron = require('node-cron');
} catch (e) {
  cronAvailable = false;
  console.warn('[ReportScheduler] node-cron not installed — falling back to simple timer. Install node-cron for cron syntax support.');
}

async function sendResilienceReport() {
  try {
    const viewers = read('users').filter(u => u.role === 'viewer' && u.email);
    if (!viewers || viewers.length === 0) {
      console.warn('[ReportScheduler] No viewer recipients configured — skipping scheduled report.');
      return { skipped: true, reason: 'no_recipients' };
    }

    const metrics = gameTheory.calculateResilienceMetrics();
    const stsReport = socioTechnical.generateResiliencyReport();
    const reportData = { metrics, stsReport };

    const pdfBuffer = await email.createResilienceReportPdf(reportData);
    const html = email.buildResilienceReportHtml(reportData);

    const results = [];
    for (const user of viewers) {
      try {
        const res = await email.sendSystemEmail({
          to: user.email,
          subject: 'KALRO Resilience Report',
          html,
          station_id: user.station_id || 'HQ',
          attachments: [ { filename: 'KALRO-Resilience-Report.pdf', content: pdfBuffer } ]
        });
        results.push({ user: user.email, status: 'sent', info: res });
      } catch (err) {
        console.error('[ReportScheduler] Failed to send to', user.email, err.message || err);
        results.push({ user: user.email, status: 'failed', error: err.message || err });
      }
    }

    console.log('[ReportScheduler] Scheduled resilience report delivered to', results.length, 'recipients');
    return { success: true, results };
  } catch (err) {
    console.error('[ReportScheduler] Error generating or sending report:', err);
    return { success: false, error: err.message || err };
  }
}

function initializeReportScheduler() {
  if (cronAvailable && cron) {
    console.log('[ReportScheduler] Scheduling reports with cron expression:', REPORT_CRON);
    cron.schedule(REPORT_CRON, () => {
      console.log('[ReportScheduler] Cron triggered — sending resilience report');
      sendResilienceReport();
    });
  } else {
    // Fallback: check once per minute and run at configured hour
    console.log('[ReportScheduler] node-cron unavailable — using fallback timer to run daily at hour', REPORT_TIME_HOUR);
    setInterval(() => {
      const now = new Date();
      if (now.getHours() === REPORT_TIME_HOUR && now.getMinutes() === 0) {
        console.log('[ReportScheduler] Fallback timer triggered — sending resilience report');
        sendResilienceReport();
      }
    }, 60 * 1000);
  }
}

module.exports = { initializeReportScheduler, sendResilienceReport };
