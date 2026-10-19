package et.gov.tigray.rpis.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Money {
    private Money() {}
    public static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
    public static BigDecimal pct(BigDecimal part, BigDecimal whole) {
        if (whole == null || whole.signum() == 0 || part == null) return BigDecimal.ZERO;
        return part.multiply(BigDecimal.valueOf(100)).divide(whole, 2, RoundingMode.HALF_UP);
    }
    public static BigDecimal ratio(BigDecimal num, BigDecimal den) {
        if (den == null || den.signum() == 0 || num == null) return null;
        return num.divide(den, 3, RoundingMode.HALF_UP);
    }
}
