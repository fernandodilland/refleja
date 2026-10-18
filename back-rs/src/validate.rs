//! Validación de entrada equivalente a Pydantic v2 (modo "lax") con mensajes y `loc` similares.
use crate::error::{AppError, ValErr};
use axum::http::{header, HeaderMap};
use serde_json::{json, Map, Value};

pub fn loc_of(base: &[Value], key: &str) -> Vec<Value> {
    let mut l = base.to_vec();
    l.push(json!(key));
    l
}

pub struct Errs(pub Vec<ValErr>);

impl Errs {
    pub fn new() -> Self {
        Errs(Vec::new())
    }
    pub fn push(&mut self, typ: &'static str, loc: Vec<Value>, msg: impl Into<String>, input: Value, ctx: Option<Value>) {
        self.0.push(ValErr { typ, loc, msg: msg.into(), input, ctx });
    }
    pub fn into_result<T>(self, ok: T) -> Result<T, AppError> {
        if self.0.is_empty() { Ok(ok) } else { Err(AppError::Validation(self.0)) }
    }

    pub fn missing(&mut self, base: &[Value], key: &str) {
        self.push("missing", loc_of(base, key), "Field required", Value::Null, None);
    }

    /// Cadena opcional/obligatoria con límites de longitud en caracteres.
    pub fn string(&mut self, obj: &Map<String, Value>, base: &[Value], key: &str, min: usize, max: usize, required: bool) -> Option<String> {
        match obj.get(key) {
            None => {
                if required { self.missing(base, key); }
                None
            }
            Some(Value::Null) if !required => None,
            Some(Value::String(s)) => {
                let n = s.chars().count();
                if n < min {
                    let plural = if min == 1 { "character" } else { "characters" };
                    self.push("string_too_short", loc_of(base, key), format!("String should have at least {min} {plural}"), json!(s), Some(json!({"min_length": min})));
                    None
                } else if n > max {
                    let plural = if max == 1 { "character" } else { "characters" };
                    self.push("string_too_long", loc_of(base, key), format!("String should have at most {max} {plural}"), json!(s), Some(json!({"max_length": max})));
                    None
                } else {
                    Some(s.clone())
                }
            }
            Some(v) => {
                self.push("string_type", loc_of(base, key), "Input should be a valid string", v.clone(), None);
                None
            }
        }
    }

    /// Entero con coerción "lax" (enteros, floats sin parte fraccionaria, strings numéricos).
    pub fn int(&mut self, obj: &Map<String, Value>, base: &[Value], key: &str, min: i64, max: i64) -> Option<i64> {
        let v = obj.get(key)?;
        if v.is_null() { return None; }
        let n = match v {
            Value::Number(n) => {
                if let Some(i) = n.as_i64() { Some(i) }
                else if let Some(f) = n.as_f64() {
                    if f.fract() == 0.0 && f.abs() < 9e15 { Some(f as i64) } else {
                        self.push("int_from_float", loc_of(base, key), "Input should be a valid integer, got a number with a fractional part", v.clone(), None);
                        return None;
                    }
                } else { None }
            }
            Value::String(s) => match s.trim().parse::<i64>() {
                Ok(i) => Some(i),
                Err(_) => {
                    self.push("int_parsing", loc_of(base, key), "Input should be a valid integer, unable to parse string as an integer", v.clone(), None);
                    return None;
                }
            },
            _ => {
                self.push("int_type", loc_of(base, key), "Input should be a valid integer", v.clone(), None);
                return None;
            }
        }?;
        if n < min {
            self.push("greater_than_equal", loc_of(base, key), format!("Input should be greater than or equal to {min}"), v.clone(), Some(json!({"ge": min})));
            None
        } else if n > max {
            self.push("less_than_equal", loc_of(base, key), format!("Input should be less than or equal to {max}"), v.clone(), Some(json!({"le": max})));
            None
        } else {
            Some(n)
        }
    }

    /// Literal cerrado opcional.
    pub fn literal(&mut self, obj: &Map<String, Value>, base: &[Value], key: &str, allowed: &[&str], required: bool) -> Option<String> {
        match obj.get(key) {
            None => { if required { self.missing(base, key); } None }
            Some(Value::Null) if !required => None,
            Some(v) => {
                if let Value::String(s) = v {
                    if allowed.contains(&s.as_str()) { return Some(s.clone()); }
                }
                let quoted: Vec<String> = allowed.iter().map(|a| format!("'{a}'")).collect();
                let expected = if quoted.len() > 1 {
                    format!("{} or {}", quoted[..quoted.len() - 1].join(", "), quoted[quoted.len() - 1])
                } else { quoted.join("") };
                self.push("literal_error", loc_of(base, key), format!("Input should be {expected}"), v.clone(), Some(json!({"expected": expected})));
                None
            }
        }
    }
}

/// Parsea el cuerpo JSON como lo hace FastAPI (content-type JSON o ausente).
pub fn parse_json_body(headers: &HeaderMap, body: &[u8]) -> Result<Value, AppError> {
    let ct = headers.get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("");
    if body.is_empty() {
        return Err(AppError::Validation(vec![ValErr { typ: "missing", loc: vec![json!("body")], msg: "Field required".into(), input: Value::Null, ctx: None }]));
    }
    if !ct.is_empty() {
        let main = ct.split(';').next().unwrap_or("").trim().to_lowercase();
        let ok = main == "application/json" || (main.starts_with("application/") && main.ends_with("+json"));
        if !ok {
            return Err(AppError::Validation(vec![ValErr {
                typ: "model_attributes_type",
                loc: vec![json!("body")],
                msg: "Input should be a valid dictionary or object to extract fields from".into(),
                input: json!(String::from_utf8_lossy(body)),
                ctx: None,
            }]));
        }
    }
    serde_json::from_slice::<Value>(body).map_err(|e| {
        AppError::Validation(vec![ValErr {
            typ: "json_invalid",
            loc: vec![json!("body"), json!(e.column().saturating_sub(1))],
            msg: "JSON decode error".into(),
            input: json!({}),
            ctx: Some(json!({"error": e.to_string()})),
        }])
    })
}

/// El cuerpo debe ser un objeto.
pub fn expect_object(v: &Value) -> Result<&Map<String, Value>, AppError> {
    v.as_object().ok_or_else(|| {
        AppError::Validation(vec![ValErr {
            typ: "model_attributes_type",
            loc: vec![json!("body")],
            msg: "Input should be a valid dictionary or object to extract fields from".into(),
            input: v.clone(),
            ctx: None,
        }])
    })
}
