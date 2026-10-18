//! Metadatos del cuestionario (allowlist de qids). Replica `back/app/form_meta.py`.
//! Fuente: `front/src/formulario.json`; si falta o es inválido, estructura de respaldo.
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

pub const FLOWS: [&str; 3] = ["pareja", "fam", "trab"];
const INTRO: [&str; 2] = ["age", "start"];
const TERMINALS: [&str; 3] = ["MINOR", "LOCATION", "RESULT"];

pub struct FormMeta {
    valid_question_ids: HashSet<String>,
    qid_flow: HashMap<String, &'static str>,
    pub flow_order: Vec<(&'static str, Vec<String>)>,
    pub intro_order: Vec<String>,
}

fn flow_of_key(key: &str) -> Option<&'static str> {
    FLOWS
        .iter()
        .copied()
        .find(|f| key.starts_with(&format!("{f}_")))
}

impl FormMeta {
    fn fallback() -> FormMeta {
        let mut qids: HashSet<String> = INTRO.iter().map(|s| s.to_string()).collect();
        let mut qid_flow = HashMap::new();
        let mut flow_order = Vec::new();
        for f in FLOWS {
            let mut v = Vec::new();
            for i in 1..=12 {
                let q = format!("{f}_{i}");
                qids.insert(q.clone());
                qid_flow.insert(q.clone(), f);
                v.push(q);
            }
            flow_order.push((f, v));
        }
        FormMeta::finish(
            qids,
            qid_flow,
            flow_order,
            vec!["age".into(), "start".into()],
        )
    }

    fn finish(
        mut qids: HashSet<String>,
        qid_flow: HashMap<String, &'static str>,
        flow_order: Vec<(&'static str, Vec<String>)>,
        intro_order: Vec<String>,
    ) -> FormMeta {
        for t in TERMINALS {
            qids.insert(t.to_string());
        }
        FormMeta {
            valid_question_ids: qids,
            qid_flow,
            flow_order,
            intro_order,
        }
    }

    fn parse(text: &str) -> Result<FormMeta, String> {
        let data: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
        let questions = data
            .get("questions")
            .and_then(|q| q.as_object())
            .ok_or("sin preguntas")?;
        if questions.is_empty() {
            return Err("sin preguntas".into());
        }
        let mut qids: HashSet<String> = INTRO.iter().map(|s| s.to_string()).collect();
        let mut qid_flow = HashMap::new();
        let mut order: Vec<(&'static str, Vec<String>)> =
            FLOWS.iter().map(|f| (*f, Vec::new())).collect();
        let mut intro_order = Vec::new();
        for (key, q) in questions {
            let qid = q
                .get("qid")
                .and_then(|x| x.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or(key)
                .to_string();
            qids.insert(qid.clone());
            if let Some(f) = flow_of_key(key) {
                qid_flow.insert(qid.clone(), f);
                order.iter_mut().find(|(n, _)| *n == f).unwrap().1.push(qid);
            } else if INTRO.contains(&key.as_str()) {
                intro_order.push(qid);
            }
        }
        if intro_order.is_empty() {
            intro_order = vec!["age".into(), "start".into()];
        }
        Ok(FormMeta::finish(qids, qid_flow, order, intro_order))
    }

    /// Carga desde `FORMULARIO_PATH` o `../front/src/formulario.json` / `front/src/formulario.json`.
    pub fn load(configured: &str) -> FormMeta {
        let candidates: Vec<PathBuf> = if configured.is_empty() {
            vec![
                "../front/src/formulario.json".into(),
                "front/src/formulario.json".into(),
            ]
        } else {
            vec![configured.into()]
        };
        for p in &candidates {
            if let Ok(text) = std::fs::read_to_string(p) {
                match FormMeta::parse(&text) {
                    Ok(m) => return m,
                    Err(e) => tracing::warn!(
                        "formulario.json inválido ({e}); usando estructura de respaldo"
                    ),
                }
                return FormMeta::fallback();
            }
        }
        tracing::warn!("formulario.json no encontrado; usando estructura de respaldo");
        FormMeta::fallback()
    }

    /// Ids aceptados por `bump_question` (preguntas + estados de ruteo).
    pub fn is_valid_question_id(&self, qid: &str) -> bool {
        self.valid_question_ids.contains(qid)
    }

    /// `true` si el qid puede aparecer en un run de ese flujo (o es intro/terminal).
    pub fn qid_ok_for_flow(&self, qid: &str, flow: Option<&str>) -> bool {
        if INTRO.contains(&qid) || TERMINALS.contains(&qid) {
            return true;
        }
        match self.qid_flow.get(qid) {
            None => false,
            Some(fq) => flow.is_none_or(|f| f == *fq),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fallback_when_missing_or_invalid() {
        let m = FormMeta::load("/ruta/que/no/existe.json");
        let n: Vec<usize> = m.flow_order.iter().map(|(_, v)| v.len()).collect();
        assert_eq!(n, vec![12, 12, 12]);
        assert!(
            m.is_valid_question_id("RESULT")
                && m.is_valid_question_id("pareja_12")
                && !m.is_valid_question_id("pareja_13")
        );
        assert!(FormMeta::parse("{not json").is_err());
        assert!(FormMeta::parse("{\"questions\": {}}").is_err());
    }

    #[test]
    fn real_form() {
        let m = FormMeta::load("../front/src/formulario.json");
        let n: Vec<usize> = m.flow_order.iter().map(|(_, v)| v.len()).collect();
        assert_eq!(n, vec![13, 12, 12]);
        assert_eq!(m.intro_order, vec!["age", "start"]);
        assert!(m.qid_ok_for_flow("pareja_1", Some("pareja")));
        assert!(!m.qid_ok_for_flow("fam_1", Some("pareja")));
        assert!(m.qid_ok_for_flow("fam_1", None));
        assert!(m.qid_ok_for_flow("RESULT", Some("trab")));
        assert!(!m.qid_ok_for_flow("", None));
    }
}
