const fs = require('node:fs');

const files = process.argv.slice(2);

if (!files.length) {
  console.error('Usage: node scripts/zap-fail-on-high.js <zap-report.json> [report...]');
  process.exit(1);
}

const alertsFromReport = (report) =>
  (report.site || []).flatMap((site) =>
    (site.alerts || []).map((alert) => ({
      site: site['@name'] || site.name || 'unknown',
      name: alert.name || alert.alert || 'Unnamed alert',
      riskCode: Number(alert.riskcode || alert.riskCode || 0),
      risk: String(alert.riskdesc || alert.risk || ''),
      count: Number(alert.count || alert.instances?.length || 0),
    })),
  );

const highAlerts = [];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.warn(`ZAP report not found, skipping: ${file}`);
    continue;
  }

  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const alert of alertsFromReport(report)) {
    if (alert.riskCode >= 3 || /^high\b/i.test(alert.risk)) {
      highAlerts.push({ file, ...alert });
    }
  }
}

if (!highAlerts.length) {
  console.log('ZAP high-risk gate passed: no High alerts found.');
  process.exit(0);
}

console.error('ZAP high-risk gate failed:');
for (const alert of highAlerts) {
  console.error(`- [${alert.file}] ${alert.site}: ${alert.name} (${alert.risk || `riskcode ${alert.riskCode}`})`);
}
process.exit(1);
