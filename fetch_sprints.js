const domain = 'webecenciaandina.atlassian.net';
const email = 'esteban.carvajal.landazuri@udla.edu.ec';
const token = 'ATATT3xFfGF0Ps6gD9ZX0jVYugPblcGtrJqxgNPq8RPkhblhLTvwVBelF2eLf_p77ikUAGQcOQXXAgg3mySym7muWIPmQLUStOIKiwfBCppt2VStcXhrAAvlV7N7sptLMl5zKU4ZioebLGDqoHUhiCe82dMytRV7cRkaroJmkcsFOSkdrHKCewQ=A895653B';
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
