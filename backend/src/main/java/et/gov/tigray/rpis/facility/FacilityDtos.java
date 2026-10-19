package et.gov.tigray.rpis.facility;

import et.gov.tigray.rpis.common.Enums.DamageSeverity;
import et.gov.tigray.rpis.common.Enums.FacilityType;
import et.gov.tigray.rpis.common.Enums.OperationalStatus;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.damage.DamageDtos;
import et.gov.tigray.rpis.geo.GeoDtos;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class FacilityDtos {
    private FacilityDtos() {}

    public record FacilitySummary(Long id, String code, String name, Sector sector, FacilityType facilityType,
                                  GeoDtos.WeredaRef wereda, String kebele, GeoPoint location,
                                  OperationalStatus operationalStatus, DamageSeverity latestSeverity, Integer latestImpactScore,
                                  LocalDate lastAssessedOn, BigDecimal replacementEstimateEtb, Integer preCrisisCapacity, String capacityUnit,
                                  Integer beneficiaries, int linkedProjects) {}

    public record FacilityDetail(FacilitySummary facility, DamageDtos.AssessmentSummary latestAssessment,
                                 List<DamageDtos.AssessmentSummary> assessmentHistory, List<LinkedProject> projects) {}

    public record LinkedProject(Long id, String code, String name, String status, String health, BigDecimal physicalProgressPct, LocalDate plannedEnd) {}
}
