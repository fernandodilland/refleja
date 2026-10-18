//! Fechas UTC "naive" y redondeo compatibles con Python (`datetime.isoformat`, `round(x, 4)`).
use chrono::{NaiveDate, NaiveDateTime, Utc};

pub fn utcnow() -> NaiveDateTime {
    Utc::now().naive_utc()
}

pub fn today_utc() -> NaiveDate {
    Utc::now().date_naive()
}

/// Equivalente de `datetime.isoformat()` para datetimes naive.
pub fn isoformat(dt: &NaiveDateTime) -> String {
    use chrono::Timelike;
    let micros = dt.nanosecond() / 1000;
    if micros == 0 {
        dt.format("%Y-%m-%dT%H:%M:%S").to_string()
    } else {
        format!("{}.{:06}", dt.format("%Y-%m-%dT%H:%M:%S"), micros)
    }
}

/// `round(x, 4)` de CPython: redondeo correcto del valor binario exacto.
pub fn round4(x: f64) -> f64 {
    format!("{:.4}", x).parse::<f64>().unwrap_or(x)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_matches_python() {
        assert_eq!(round4(0.12345), 0.1235);
        assert_eq!(round4(2.0 / 3.0), 0.6667);
        assert_eq!(round4(0.00005), 0.0001);
        assert_eq!(round4(1.0), 1.0);
    }
    #[test]
    fn iso() {
        let d = NaiveDate::from_ymd_opt(2026, 10, 18)
            .unwrap()
            .and_hms_micro_opt(6, 15, 34, 573642)
            .unwrap();
        assert_eq!(isoformat(&d), "2026-10-18T06:15:34.573642");
        assert_eq!(isoformat(&d.with_nanosecond_zero()), "2026-10-18T06:15:34");
    }
    trait Z {
        fn with_nanosecond_zero(&self) -> NaiveDateTime;
    }
    impl Z for NaiveDateTime {
        fn with_nanosecond_zero(&self) -> NaiveDateTime {
            use chrono::Timelike;
            self.with_nanosecond(0).unwrap()
        }
    }
}
