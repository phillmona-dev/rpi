package et.gov.tigray.rpis.analytics;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ScheduleBaselineTest {
    private final LocalDate start = LocalDate.of(2026, 1, 1);
    private final LocalDate end = LocalDate.of(2026, 12, 31);

    @Test
    void linearWhenNoMilestones() {
        assertThat(ScheduleBaseline.plannedPct(start, end, List.of(), start)).isEqualTo(0);
        assertThat(ScheduleBaseline.plannedPct(start, end, List.of(), end)).isEqualTo(100);
        assertThat(ScheduleBaseline.plannedPct(start, end, List.of(), LocalDate.of(2026, 7, 2))).isCloseTo(50, within(1.0));
    }

    @Test
    void piecewiseWithMilestones() {
        var pts = List.of(new ScheduleBaseline.Point(LocalDate.of(2026, 3, 1), 10), new ScheduleBaseline.Point(LocalDate.of(2026, 9, 1), 70));
        assertThat(ScheduleBaseline.plannedPct(start, end, pts, LocalDate.of(2026, 3, 1))).isEqualTo(10);
        assertThat(ScheduleBaseline.plannedPct(start, end, pts, LocalDate.of(2026, 6, 1))).isCloseTo(40, within(1.0));
        assertThat(ScheduleBaseline.plannedPct(start, end, pts, LocalDate.of(2026, 11, 1))).isGreaterThan(70).isLessThan(100);
    }

    @Test
    void clampsOutsideWindow() {
        assertThat(ScheduleBaseline.plannedPct(start, end, List.of(), start.minusDays(30))).isEqualTo(0);
        assertThat(ScheduleBaseline.plannedPct(start, end, List.of(), end.plusDays(30))).isEqualTo(100);
    }
}
