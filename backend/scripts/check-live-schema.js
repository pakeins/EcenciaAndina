require('dotenv').config();
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

async function checkSchema() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("Faltan credenciales de Supabase en el .env");
        return;
    }

    try {
        console.log(`Conectando a Supabase OpenAPI: ${SUPABASE_URL}`);
        
        // El endpoint OpenAPI de Supabase devuelve las definiciones de las tablas accesibles
        const response = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_SERVICE_ROLE_KEY}`);
        
        if (!response.ok) {
            console.error(`Error al conectar: ${response.status} ${response.statusText}`);
            return;
        }

        const data = await response.json();
        
        // Las tablas reales se encuentran como keys en el objeto "definitions"
        if (data && data.definitions) {
            const tables = Object.keys(data.definitions);
            console.log("------------------------------------------");
            console.log(`¡Conexión exitosa! Se encontraron ${tables.length} tablas/vistas:`);
            console.log("------------------------------------------");
            tables.sort().forEach(t => console.log(`- ${t}`));
        } else {
            console.log("No se pudo parsear las definiciones del esquema.");
        }
    } catch (e) {
        console.error("Error al ejecutar la comprobación:", e.message);
    }
}

checkSchema();
