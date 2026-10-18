//! Slugs de municipios válidos y normalización. Replica `back/app/analytics.py:25-50`.
pub const VALID_MUNICIPIOS: [&str; 52] = [
    "abasolo",
    "agualeguas",
    "los-aldamas",
    "allende",
    "anahuac",
    "apodaca",
    "aramberri",
    "bustamante",
    "cadereyta-jimenez",
    "el-carmen",
    "cerralvo",
    "cienega-de-flores",
    "china",
    "doctor-arroyo",
    "doctor-coss",
    "doctor-gonzalez",
    "galeana",
    "garcia",
    "san-pedro-garza-garcia",
    "general-bravo",
    "general-escobedo",
    "general-teran",
    "general-trevino",
    "general-zaragoza",
    "general-zuazua",
    "guadalupe",
    "los-herreras",
    "higueras",
    "hualahuises",
    "iturbide",
    "juarez",
    "lampazos-de-naranjo",
    "linares",
    "marin",
    "melchor-ocampo",
    "mier-y-noriega",
    "mina",
    "montemorelos",
    "monterrey",
    "paras",
    "pesqueria",
    "los-ramones",
    "rayones",
    "sabinas-hidalgo",
    "salinas-victoria",
    "san-nicolas-de-los-garza",
    "hidalgo",
    "santa-catarina",
    "santiago",
    "vallecillo",
    "villaldama",
    "otro",
];

/// Normaliza a slug y valida contra la lista real. `None` si no es válido.
pub fn normalize_municipio(value: Option<&str>) -> Option<String> {
    let v = value?;
    if v.is_empty() {
        return None;
    }
    let s: String = v.trim().to_lowercase().replace(' ', "-");
    let s: String = s
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '-')
        .collect();
    let s: String = s.chars().take(48).collect();
    let s = s.trim_matches('-').to_string();
    if VALID_MUNICIPIOS.contains(&s.as_str()) {
        Some(s)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normaliza() {
        assert_eq!(
            normalize_municipio(Some(" Monterrey ")).as_deref(),
            Some("monterrey")
        );
        assert_eq!(
            normalize_municipio(Some("San Nicolas De Los Garza")).as_deref(),
            Some("san-nicolas-de-los-garza")
        );
        assert_eq!(normalize_municipio(Some("Cadereyta Jiménez")), None);
        assert_eq!(normalize_municipio(Some("nope")), None);
        assert_eq!(normalize_municipio(None), None);
    }
}
