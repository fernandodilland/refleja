const fs = require('fs');
const path = require('path');

// Paths
const formPath = path.join(__dirname, 'formulario.json');
const wordOutputPath = path.join(__dirname, '..', 'cuestionario_word.txt');
const mdOutputPath = path.join(__dirname, '..', 'cuestionario_flujo.md');

// Helper to wrap text for Mermaid nodes
function wrapText(text, maxLen = 40) {
    if (!text) return "";
    const words = text.split(" ");
    let lines = [];
    let currentLine = "";
    for (const word of words) {
        if ((currentLine + " " + word).trim().length > maxLen) {
            lines.push(currentLine.trim());
            currentLine = word;
        } else {
            currentLine += " " + word;
        }
    }
    if (currentLine) {
        lines.push(currentLine.trim());
    }
    return lines.join("<br>");
}

// Read data
let data;
try {
    const raw = fs.readFileSync(formPath, 'utf8');
    data = JSON.parse(raw);
} catch (e) {
    console.error("Error al leer formulario.json:", e);
    process.exit(1);
}

const { questions, flowLengths, violenceTypeInfo } = data;

// --- 1. GENERATE WORD COMPATIBLE TEXT DOCUMENT ---
let textDoc = [];
textDoc.push("==========================================================================");
textDoc.push("                   PORTAL REFLEJA - CUESTIONARIOS Y FLUJOS");
textDoc.push("==========================================================================");
textDoc.push(`Generado el: ${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString('es-MX')}`);
textDoc.push("\nEste documento contiene todos los flujos de preguntas, opciones, redirecciones");
textDoc.push("y puntajes asociados. Formateado especialmente para copiar y pegar en Word.\n");

textDoc.push("--------------------------------------------------------------------------");
textDoc.push("1. CONFIGURACIÓN INICIAL (Preguntas Comunes)");
textDoc.push("--------------------------------------------------------------------------\n");

// Age question
textDoc.push(`PREGUNTA: age (Configuración de Edad)`);
textDoc.push(`Texto: ${questions.age.text}`);
textDoc.push(`Explicación: ${questions.age.explanation}`);
textDoc.push(`Fuente: ${questions.age.source}`);
textDoc.push("Opciones:");
questions.age.options.forEach(opt => {
    textDoc.push(`  [ ] ${opt.label}  -->  Siguiente: ${opt.nextId}`);
});
textDoc.push("\n");

// Start question
textDoc.push(`PREGUNTA: start (Selección de Vínculo/Relación)`);
textDoc.push(`Texto: ${questions.start.text}`);
textDoc.push(`Explicación: ${questions.start.explanation}`);
textDoc.push(`Fuente: ${questions.start.source}`);
textDoc.push("Opciones:");
questions.start.options.forEach(opt => {
    textDoc.push(`  [ ] ${opt.label}  -->  Siguiente: ${opt.nextId}`);
});
textDoc.push("\n");

// Flows
const flows = [
    { key: "pareja", name: "FLUJO 1: PAREJA O EXPAREJA" },
    { key: "fam", name: "FLUJO 2: FAMILIAR (PADRES, HERMANOS, ETC.)" },
    { key: "trab", name: "FLUJO 3: TRABAJO O ESCUELA" }
];

flows.forEach(flow => {
    textDoc.push("--------------------------------------------------------------------------");
    textDoc.push(`${flow.name}`);
    textDoc.push("--------------------------------------------------------------------------\n");

    // Get all questions belonging to this flow (keys starting with flow.key + "_")
    const flowQuestions = Object.keys(questions)
        .filter(k => k.startsWith(`${flow.key}_`))
        .sort((a, b) => {
            const numA = parseInt(a.split('_')[1]);
            const numB = parseInt(b.split('_')[1]);
            return numA - numB;
        });

    flowQuestions.forEach((qKey, idx) => {
        const q = questions[qKey];
        textDoc.push(`Pregunta ${idx + 1} (${qKey}):`);
        textDoc.push(`Texto: ${q.text}`);
        if (q.explanation) textDoc.push(`Explicación: ${q.explanation}`);
        if (q.source) textDoc.push(`Fuente: ${q.source}`);
        textDoc.push("Opciones:");
        q.options.forEach(opt => {
            let scoreStr = "";
            if (opt.scores && Object.keys(opt.scores).length > 0) {
                const parts = Object.entries(opt.scores).map(([k, v]) => `${violenceTypeInfo[k]?.name || k}: +${v}`);
                scoreStr = ` (Puntaje: ${parts.join(', ')})`;
            }
            textDoc.push(`  [ ] ${opt.label}  -->  Siguiente: ${opt.nextId}${scoreStr}`);
        });
        textDoc.push("\n");
    });
});

fs.writeFileSync(wordOutputPath, textDoc.join('\n'), 'utf8');
console.log(`Creado cuestionario_word.txt en: ${wordOutputPath}`);


// --- 2. GENERATE MERMAID DIAGRAMS IN MARKDOWN ---
let mdDoc = [];
mdDoc.push("# 📊 Mapa de Flujos de Cuestionarios - REFLEJA\n");
mdDoc.push("Este documento contiene las representaciones visuales de los flujos de preguntas.");
mdDoc.push("Puedes visualizar estos diagramas de flujo offline usando editores compatibles con Mermaid.js (como VS Code, Obsidian, GitHub) o copiando el código en [Mermaid Live Editor](https://mermaid.live).\n");

// Flowchart definitions
mdDoc.push("## 🗺️ Mapa General de Navegación\n");
mdDoc.push("```mermaid");
mdDoc.push("flowchart TD");
mdDoc.push("    %% Estilos de nodos");
mdDoc.push("    classDef startNode fill:#eef2ff,stroke:#6366f1,stroke-width:2px,color:#1e1b4b;");
mdDoc.push("    classDef flowNode fill:#faf5ff,stroke:#d946ef,stroke-width:1.5px,color:#4a044e;");
mdDoc.push("    classDef specialNode fill:#fff1f2,stroke:#f43f5e,stroke-width:2px,color:#9f1239;");

// Root nodes
mdDoc.push(`    age["<b>¿Qué edad tienes?</b><br>${wrapText(questions.age.text, 50)}"]:::startNode`);
mdDoc.push(`    start["<b>Relación con agresor</b><br>${wrapText(questions.start.text, 50)}"]:::startNode`);
mdDoc.push(`    MINOR["<b>PANTALLA: Menor de Edad</b><br>Redirección a apoyo con padres/tutores"]:::specialNode`);
mdDoc.push(`    LOCATION["<b>PANTALLA: Selección de Municipio</b><br>Ingreso de ubicación para directorio"]:::specialNode`);

// Connect Root
mdDoc.push("    age --> |\"Menos de 18 años\"| MINOR");
mdDoc.push("    age --> |\"18 a 25 años\"| start");
mdDoc.push("    age --> |\"26 a 40 años\"| start");
mdDoc.push("    age --> |\"41 años o más\"| start");

mdDoc.push("    start --> |\"Mi pareja o ex pareja\"| pareja_1");
mdDoc.push("    start --> |\"Un familiar (madre, padre...)\"| fam_1");
mdDoc.push("    start --> |\"Alguien de mi trabajo/escuela\"| trab_1");
mdDoc.push("    start --> |\"Otra persona\"| pareja_1");

// Connect flows to location
mdDoc.push("    pareja_12 --> |Siguiente| LOCATION");
mdDoc.push("    fam_12 --> |Siguiente| LOCATION");
mdDoc.push("    trab_12 --> |Siguiente| LOCATION");

mdDoc.push("```\n");

// Individual flow sections
flows.forEach(flow => {
    mdDoc.push(`## 📌 ${flow.name}\n`);
    mdDoc.push("```mermaid");
    mdDoc.push("flowchart TD");
    mdDoc.push("    classDef qNode fill:#f0fdf4,stroke:#22c55e,stroke-width:1.5px,color:#14532d;");
    mdDoc.push("    classDef destNode fill:#fff1f2,stroke:#f43f5e,stroke-width:2px,color:#9f1239;");

    const flowQuestions = Object.keys(questions)
        .filter(k => k.startsWith(`${flow.key}_`))
        .sort((a, b) => {
            const numA = parseInt(a.split('_')[1]);
            const numB = parseInt(b.split('_')[1]);
            return numA - numB;
        });

    // Write nodes with text wrapping
    flowQuestions.forEach((qKey, idx) => {
        const q = questions[qKey];
        mdDoc.push(`    ${qKey}["<b>P${idx + 1}:</b> ${wrapText(q.text, 50)}"]:::qNode`);
    });
    mdDoc.push("    LOCATION[\"<b>PANTALLA: Selección de Municipio</b>\"]:::destNode");

    // Write connections
    flowQuestions.forEach((qKey) => {
        const q = questions[qKey];
        q.options.forEach(opt => {
            let label = opt.label;
            if (label.length > 25) label = label.substring(0, 22) + "...";
            mdDoc.push(`    ${qKey} --> |"${label}"| ${opt.nextId}`);
        });
    });

    mdDoc.push("```\n");
});

fs.writeFileSync(mdOutputPath, mdDoc.join('\n'), 'utf8');
console.log(`Creado cuestionario_flujo.md en: ${mdOutputPath}`);
