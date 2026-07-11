const domain = 'webecenciaandina.atlassian.net';
const email = 'esteban.carvajal.landazuri@udla.edu.ec';
// WARNING: The token was revoked/removed from source control. Provide it via environment variables.
const token = process.env.JIRA_API_TOKEN || '';
const auth = Buffer.from(`${email}:${token}`).toString('base64');

async function run() {
  try {
    const res = await fetch(`https://${domain}/rest/agile/1.0/board`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      console.error('Failed to fetch boards:', res.status, await res.text());
      return;
    }

    const data = await res.json();
    console.log("Boards found:");
    for (const board of data.values) {
        console.log(`- Board ID: ${board.id}, Name: ${board.name}, Type: ${board.type}`);
        
        if (board.type === 'scrum') {
            const sprintRes = await fetch(`https://${domain}/rest/agile/1.0/board/${board.id}/sprint`, {
                headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
            });
            if (sprintRes.ok) {
                const sprintData = await sprintRes.json();
                console.log(`  Sprints in board ${board.id}:`);
                sprintData.values.forEach(s => {
                    console.log(`    * Sprint ID: ${s.id}, Name: ${s.name}, State: ${s.state}`);
                });
            }
        }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
