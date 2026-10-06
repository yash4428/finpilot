package com.finpilot.config;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Money {
    private Money() {}

    public static BigDecimal of(Object v) {
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof BigDecimal b) return b.setScale(2, RoundingMode.HALF_UP);
        return new BigDecimal(v.toString()).setScale(2, RoundingMode.HALF_UP);
    }

    public static BigDecimal r(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v.setScale(2, RoundingMode.HALF_UP);
    }

    public static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    /** Indian digit grouping without paise, e.g. 123456 -> "₹1,23,456". */
    public static String inr(BigDecimal v) {
        long n = nz(v).setScale(0, RoundingMode.HALF_UP).longValue();
        String sign = n < 0 ? "-" : "";
        String s = String.valueOf(Math.abs(n));
        if (s.length() > 3) {
            String head = s.substring(0, s.length() - 3);
            String tail = s.substring(s.length() - 3);
            head = head.replaceAll("\\B(?=(\\d{2})+(?!\\d))", ",");
            s = head + "," + tail;
        }
        return sign + "₹" + s;
    }
}
