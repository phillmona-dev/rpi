package et.gov.tigray.rpis.demo;

import et.gov.tigray.rpis.common.Enums.FacilityType;
import et.gov.tigray.rpis.common.Enums.FundingSource;
import et.gov.tigray.rpis.common.Enums.ProjectStatus;

import java.util.List;

import static et.gov.tigray.rpis.common.Enums.FacilityType.*;
import static et.gov.tigray.rpis.common.Enums.FundingSource.*;
import static et.gov.tigray.rpis.common.Enums.ProjectStatus.*;

/**
 * Curated demo catalogue: real place names and plausible institutions, with synthetic damage and
 * project figures. Replaced wholesale by field data in production; kept out of Flyway on purpose.
 */
final class DemoCatalog {
    private DemoCatalog() {}

    /** wereda code, facility type, name, capacity, unit, severity 0-4 (NONE..DESTROYED), beneficiaries */
    record Fac(String wereda, FacilityType type, String name, int capacity, String unit, int severity, int beneficiaries) {}

    static final List<Fac> FACILITIES = List.of(
        // ── Education ───────────────────────────────────────────────────────────
        new Fac("TG-MK-07", UNIVERSITY, "Mekelle University – Adi Haki Campus", 31000, "students", 2, 31000),
        new Fac("TG-C-03",  UNIVERSITY, "Axum University – Main Campus", 18000, "students", 3, 18000),
        new Fac("TG-E-01",  UNIVERSITY, "Adigrat University", 15000, "students", 3, 15000),
        new Fac("TG-S-06",  UNIVERSITY, "Raya University – Maichew Campus", 9000, "students", 2, 9000),
        new Fac("TG-MK-02", SECONDARY_SCHOOL, "Kelamino Special High School", 1200, "students", 1, 1200),
        new Fac("TG-MK-04", SECONDARY_SCHOOL, "Atse Yohannes Preparatory School", 2800, "students", 2, 2800),
        new Fac("TG-E-01",  SECONDARY_SCHOOL, "Agazi Secondary School", 3200, "students", 3, 3200),
        new Fac("TG-C-02",  SECONDARY_SCHOOL, "Nigste Saba Secondary School", 2600, "students", 3, 2600),
        new Fac("TG-NW-01", SECONDARY_SCHOOL, "Shire Secondary School", 3400, "students", 3, 3400),
        new Fac("TG-E-06",  SECONDARY_SCHOOL, "Hawzen Secondary School", 1800, "students", 4, 1800),
        new Fac("TG-E-08",  SECONDARY_SCHOOL, "Wukro Secondary School", 2400, "students", 2, 2400),
        new Fac("TG-S-01",  SECONDARY_SCHOOL, "Alamata Secondary School", 2900, "students", 3, 2900),
        new Fac("TG-S-07",  SECONDARY_SCHOOL, "Korem Secondary School", 1700, "students", 3, 1700),
        new Fac("TG-W-02",  SECONDARY_SCHOOL, "Humera Secondary School", 2100, "students", 4, 2100),
        new Fac("TG-C-11",  SECONDARY_SCHOOL, "Abiy Adi Secondary School", 1900, "students", 3, 1900),
        new Fac("TG-E-03",  PRIMARY_SCHOOL, "Zalambessa Primary School", 900, "students", 4, 900),
        new Fac("TG-E-05",  PRIMARY_SCHOOL, "Edaga Hamus Primary School", 1100, "students", 3, 1100),
        new Fac("TG-C-10",  PRIMARY_SCHOOL, "Yechila Primary School", 750, "students", 3, 750),
        new Fac("TG-S-02",  PRIMARY_SCHOOL, "Mehoni Primary School", 1300, "students", 2, 1300),
        new Fac("TG-SE-03", PRIMARY_SCHOOL, "Samre Primary School", 820, "students", 3, 820),
        new Fac("TG-SE-04", PRIMARY_SCHOOL, "Hagere Selam Primary School", 940, "students", 2, 940),
        new Fac("TG-E-05",  PRIMARY_SCHOOL, "Freweini Primary School", 1050, "students", 3, 1050),
        new Fac("TG-NW-07", PRIMARY_SCHOOL, "Sheraro Primary School", 1400, "students", 4, 1400),
        new Fac("TG-NW-05", PRIMARY_SCHOOL, "May Tsebri Primary School", 980, "students", 3, 980),
        new Fac("TG-C-07",  PRIMARY_SCHOOL, "Rama Primary School", 860, "students", 4, 860),
        new Fac("TG-C-05",  PRIMARY_SCHOOL, "Inticho Primary School", 1150, "students", 2, 1150),
        new Fac("TG-MK-05", TVET_COLLEGE, "Mekelle Polytechnic College", 4200, "trainees", 2, 4200),
        new Fac("TG-C-03",  TVET_COLLEGE, "Axum TVET College", 2300, "trainees", 3, 2300),
        new Fac("TG-S-06",  TVET_COLLEGE, "Maichew Polytechnic College", 2600, "trainees", 2, 2600),
        new Fac("TG-NW-01", TVET_COLLEGE, "Shire TVET College", 2100, "trainees", 3, 2100),
        // ── Health ──────────────────────────────────────────────────────────────
        new Fac("TG-MK-01", REFERRAL_HOSPITAL, "Ayder Comprehensive Specialized Hospital", 500, "beds", 2, 9000000),
        new Fac("TG-MK-04", GENERAL_HOSPITAL, "Mekelle General Hospital", 220, "beds", 2, 600000),
        new Fac("TG-E-01",  GENERAL_HOSPITAL, "Adigrat General Hospital", 180, "beds", 3, 450000),
        new Fac("TG-NW-01", GENERAL_HOSPITAL, "Suhul General Hospital", 160, "beds", 3, 520000),
        new Fac("TG-C-03",  GENERAL_HOSPITAL, "Axum St. Mary General Hospital", 150, "beds", 3, 410000),
        new Fac("TG-C-02",  GENERAL_HOSPITAL, "Adwa General Hospital", 140, "beds", 2, 380000),
        new Fac("TG-S-06",  GENERAL_HOSPITAL, "Lemlem Karl General Hospital", 130, "beds", 2, 360000),
        new Fac("TG-E-08",  GENERAL_HOSPITAL, "Wukro General Hospital", 120, "beds", 3, 300000),
        new Fac("TG-W-02",  GENERAL_HOSPITAL, "Kahsay Abera General Hospital", 110, "beds", 4, 290000),
        new Fac("TG-S-01",  GENERAL_HOSPITAL, "Alamata General Hospital", 120, "beds", 3, 310000),
        new Fac("TG-C-11",  PRIMARY_HOSPITAL, "Abiy Adi Primary Hospital", 60, "beds", 3, 150000),
        new Fac("TG-E-06",  PRIMARY_HOSPITAL, "Hawzen Primary Hospital", 50, "beds", 4, 134000),
        new Fac("TG-S-02",  PRIMARY_HOSPITAL, "Mehoni Primary Hospital", 55, "beds", 2, 168000),
        new Fac("TG-S-07",  PRIMARY_HOSPITAL, "Korem Primary Hospital", 45, "beds", 3, 120000),
        new Fac("TG-NW-07", PRIMARY_HOSPITAL, "Sheraro Primary Hospital", 50, "beds", 4, 112000),
        new Fac("TG-SE-03", PRIMARY_HOSPITAL, "Samre Primary Hospital", 40, "beds", 3, 146000),
        new Fac("TG-E-03",  HEALTH_CENTER, "Zalambessa Health Center", 25, "beds", 4, 40000),
        new Fac("TG-C-06",  HEALTH_CENTER, "Edaga Arbi Health Center", 20, "beds", 3, 35000),
        new Fac("TG-C-05",  HEALTH_CENTER, "Inticho Health Center", 25, "beds", 2, 45000),
        new Fac("TG-SE-02", HEALTH_CENTER, "Adi Gudom Health Center", 20, "beds", 3, 42000),
        new Fac("TG-E-09",  HEALTH_CENTER, "Atsbi Health Center", 20, "beds", 3, 38000),
        new Fac("TG-E-04",  HEALTH_CENTER, "Dawhan Health Center", 15, "beds", 4, 16000),
        new Fac("TG-W-03",  HEALTH_CENTER, "May Gaba Health Center", 20, "beds", 4, 40000),
        new Fac("TG-W-04",  HEALTH_CENTER, "Dansha Health Center", 20, "beds", 3, 36000),
        new Fac("TG-C-10",  HEALTH_POST, "Yechila Health Post", 5, "beds", 3, 9000),
        new Fac("TG-NW-03", HEALTH_POST, "Selekleka Health Post", 5, "beds", 2, 8000),
        new Fac("TG-NW-06", HEALTH_POST, "Adi Daero Health Post", 5, "beds", 4, 7500),
        new Fac("TG-NW-04", HEALTH_POST, "Endabaguna Health Post", 5, "beds", 3, 8200),
        // ── Manufacturing ───────────────────────────────────────────────────────
        new Fac("TG-MK-05", INDUSTRIAL_PARK, "Mekelle Industrial Park", 15, "sheds", 2, 20000),
        new Fac("TG-C-02",  FACTORY, "Almeda Textile Factory", 7000, "jobs", 3, 7000),
        new Fac("TG-E-01",  FACTORY, "Addis Pharmaceutical Factory – Adigrat", 1200, "jobs", 3, 1200),
        new Fac("TG-E-08",  FACTORY, "Sheba Leather Industry", 1500, "jobs", 3, 1500),
        new Fac("TG-MK-03", FACTORY, "Mesfin Industrial Engineering", 1800, "jobs", 2, 1800),
        new Fac("TG-MK-06", FACTORY, "Messebo Cement Factory", 2200, "jobs", 1, 2200),
        new Fac("TG-S-06",  FACTORY, "Maichew Particle Board Factory", 400, "jobs", 4, 400),
        new Fac("TG-MK-02", FACTORY, "Desta Alcohol & Liquor Factory", 350, "jobs", 2, 350),
        new Fac("TG-SE-01", FACTORY, "Saba Marble Factory", 600, "jobs", 3, 600),
        new Fac("TG-W-02",  AGRO_PROCESSING_PLANT, "Humera Sesame Processing Plant", 900, "jobs", 4, 900),
        new Fac("TG-S-06",  FACTORY, "Raya Brewery", 500, "jobs", 2, 500),
        new Fac("TG-S-01",  AGRO_PROCESSING_PLANT, "Alamata Agro-Processing Plant", 320, "jobs", 3, 320),
        new Fac("TG-C-03",  AGRO_PROCESSING_PLANT, "Axum Flour Mill", 180, "jobs", 2, 180),
        new Fac("TG-NW-01", WAREHOUSE, "Shire Grain Warehouse Complex", 40000, "tonnes", 3, 500000),
        new Fac("TG-MK-07", WAREHOUSE, "Mekelle Central Warehouse", 60000, "tonnes", 1, 800000),
        new Fac("TG-E-07",  INDUSTRIAL_PARK, "Wukro Agro-Industrial Park", 8, "sheds", 3, 6000),
        // ── Agriculture ─────────────────────────────────────────────────────────
        new Fac("TG-S-02",  IRRIGATION_SCHEME, "Raya Valley Irrigation Scheme", 18000, "hectares", 3, 90000),
        new Fac("TG-NW-05", IRRIGATION_SCHEME, "Tekeze Small-Scale Irrigation Scheme", 2400, "hectares", 3, 14000),
        new Fac("TG-E-09",  IRRIGATION_SCHEME, "Ruba Feleg Irrigation Scheme", 600, "hectares", 2, 4200),
        new Fac("TG-SE-01", IRRIGATION_SCHEME, "Gereb Giba Irrigation Scheme", 1100, "hectares", 3, 7800),
        new Fac("TG-W-01",  IRRIGATION_SCHEME, "Humera Large-Scale Farm Irrigation", 25000, "hectares", 4, 60000),
        new Fac("TG-C-04",  IRRIGATION_SCHEME, "May Negus Dam Irrigation", 800, "hectares", 2, 5600),
        new Fac("TG-S-01",  IRRIGATION_SCHEME, "Alamata Irrigation Scheme", 1500, "hectares", 3, 9000),
        new Fac("TG-C-06",  IRRIGATION_SCHEME, "Werie Irrigation Scheme", 700, "hectares", 3, 4900),
        new Fac("TG-MK-03", VETERINARY_CLINIC, "Mekelle Veterinary Clinic", 12, "staff", 2, 40000),
        new Fac("TG-E-01",  VETERINARY_CLINIC, "Adigrat Veterinary Clinic", 8, "staff", 3, 30000),
        new Fac("TG-NW-01", VETERINARY_CLINIC, "Shire Veterinary Clinic", 8, "staff", 3, 32000),
        new Fac("TG-SE-02", VETERINARY_CLINIC, "Hintalo Wajirat Veterinary Clinic", 6, "staff", 4, 28000),
        new Fac("TG-W-02",  VETERINARY_CLINIC, "Humera Veterinary Clinic", 6, "staff", 4, 22000),
        new Fac("TG-C-04",  SEED_MULTIPLICATION_CENTER, "Axum Seed Multiplication Center", 300, "hectares", 3, 25000),
        new Fac("TG-S-01",  SEED_MULTIPLICATION_CENTER, "Alamata Seed Multiplication Center", 250, "hectares", 3, 21000),
        new Fac("TG-MK-05", AGRICULTURAL_RESEARCH_CENTER, "Mekelle Agricultural Research Center", 120, "staff", 2, 100000),
        new Fac("TG-NW-05", AGRICULTURAL_RESEARCH_CENTER, "Shire-Maitsebri Agricultural Research Center", 60, "staff", 3, 60000),
        new Fac("TG-W-01",  AGRICULTURAL_RESEARCH_CENTER, "Humera Agricultural Research Center", 50, "staff", 4, 50000),
        new Fac("TG-E-07",  FARMERS_TRAINING_CENTER, "Wukro Farmers Training Center", 200, "trainees", 2, 6000),
        new Fac("TG-E-06",  FARMERS_TRAINING_CENTER, "Hawzen Farmers Training Center", 150, "trainees", 4, 5000),
        new Fac("TG-S-03",  FARMERS_TRAINING_CENTER, "Ofla Farmers Training Center", 150, "trainees", 3, 5200),
        new Fac("TG-S-04",  FARMERS_TRAINING_CENTER, "Endamehoni Farmers Training Center", 120, "trainees", 2, 4000),
        new Fac("TG-NW-03", FARMERS_TRAINING_CENTER, "Medebay Zana Farmers Training Center", 150, "trainees", 3, 5100),
        new Fac("TG-C-05",  FARMERS_TRAINING_CENTER, "Ahferom Farmers Training Center", 180, "trainees", 3, 6200)
    );

    /**
     * facility name, project name, status, start (yyyy-mm), duration months, budget ETB millions, funding, contractor,
     * performance factor (physical ÷ planned), cost factor (expended ÷ earned value), days since last site report
     */
    record Proj(String facility, String name, ProjectStatus status, String start, int months, double budgetM, FundingSource funding,
                String contractor, double perf, double cost, int reportLagDays) {}

    static final List<Proj> PROJECTS = List.of(
        // Education
        new Proj("Axum University – Main Campus", "Rehabilitation of Axum University laboratories and dormitories", ACTIVE, "2026-02", 18, 420, FEDERAL_TRANSFER, "Sur Construction PLC", 0.78, 1.08, 4),
        new Proj("Adigrat University", "Reconstruction of Adigrat University library and ICT centre", ACTIVE, "2026-03", 16, 310, DONOR_GRANT, "Tigray Construction Enterprise", 0.92, 0.98, 2),
        new Proj("Mekelle University – Adi Haki Campus", "Restoration of Adi Haki lecture halls and student services", ACTIVE, "2026-01", 14, 260, REGIONAL_TREASURY, "Mesfin Industrial Engineering", 1.02, 0.96, 1),
        new Proj("Agazi Secondary School", "Reconstruction of Agazi Secondary School (24 classrooms)", ACTIVE, "2026-02", 12, 86, DONOR_GRANT, "Tesfa Construction PLC", 0.64, 1.15, 9),
        new Proj("Nigste Saba Secondary School", "Rehabilitation of Nigste Saba Secondary School", ACTIVE, "2026-04", 10, 58, REGIONAL_TREASURY, "Selam Builders PLC", 0.97, 1.0, 3),
        new Proj("Shire Secondary School", "Reconstruction of Shire Secondary School science block", ACTIVE, "2026-03", 12, 72, FEDERAL_TRANSFER, "Habesha Construction & Design", 0.55, 1.12, 31),
        new Proj("Hawzen Secondary School", "Full reconstruction of Hawzen Secondary School", PROCUREMENT, "2026-11", 16, 140, DONOR_GRANT, null, 1.0, 1.0, 0),
        new Proj("Alamata Secondary School", "Rehabilitation of Alamata Secondary School", ACTIVE, "2026-05", 9, 49, REGIONAL_TREASURY, "Nile Contractors PLC", 0.88, 1.02, 6),
        new Proj("Humera Secondary School", "Reconstruction of Humera Secondary School", ACTIVE, "2026-06", 14, 95, FEDERAL_TRANSFER, "Zenith Engineering PLC", 0.42, 1.22, 48),
        new Proj("Zalambessa Primary School", "Reconstruction of Zalambessa Primary School", ACTIVE, "2026-04", 8, 28, DIASPORA_FUND, "Selam Builders PLC", 1.08, 0.94, 2),
        new Proj("Edaga Hamus Primary School", "Rehabilitation of Edaga Hamus Primary School", COMPLETED, "2025-12", 7, 19, DONOR_GRANT, "Tesfa Construction PLC", 1.0, 0.97, 60),
        new Proj("Yechila Primary School", "Rehabilitation of Yechila Primary School", COMPLETED, "2026-01", 6, 16, DIASPORA_FUND, "Selam Builders PLC", 1.0, 1.01, 45),
        new Proj("Samre Primary School", "Rehabilitation of Samre Primary School and water point", ACTIVE, "2026-06", 8, 22, REGIONAL_TREASURY, "Tesfa Construction PLC", 0.83, 1.04, 5),
        new Proj("Sheraro Primary School", "Reconstruction of Sheraro Primary School", PLANNED, "2027-01", 10, 36, DONOR_GRANT, null, 1.0, 1.0, 0),
        new Proj("Rama Primary School", "Reconstruction of Rama Primary School", ACTIVE, "2026-07", 9, 31, FEDERAL_TRANSFER, "Habesha Construction & Design", 0.71, 1.09, 12),
        new Proj("Axum TVET College", "Rehabilitation of Axum TVET College workshops", ACTIVE, "2026-03", 12, 110, DEVELOPMENT_LOAN, "Tigray Construction Enterprise", 0.94, 0.99, 3),
        new Proj("Shire TVET College", "Rehabilitation of Shire TVET College", SUSPENDED, "2026-02", 12, 88, DEVELOPMENT_LOAN, "Zenith Engineering PLC", 0.5, 1.1, 70),
        // Health
        new Proj("Ayder Comprehensive Specialized Hospital", "Restoration of Ayder oxygen plant, ICU and imaging wing", ACTIVE, "2026-01", 15, 680, FEDERAL_TRANSFER, "Defense Construction Enterprise", 0.96, 1.01, 1),
        new Proj("Adigrat General Hospital", "Reconstruction of Adigrat General Hospital surgical block", ACTIVE, "2026-02", 16, 390, DONOR_GRANT, "Sur Construction PLC", 0.81, 1.06, 4),
        new Proj("Suhul General Hospital", "Rehabilitation of Suhul General Hospital", ACTIVE, "2026-03", 14, 340, DONOR_GRANT, "Tigray Construction Enterprise", 0.69, 1.11, 7),
        new Proj("Axum St. Mary General Hospital", "Rehabilitation of Axum St. Mary Hospital maternity and OPD", ACTIVE, "2026-04", 12, 250, FEDERAL_TRANSFER, "Mesfin Industrial Engineering", 0.99, 0.97, 2),
        new Proj("Wukro General Hospital", "Reconstruction of Wukro General Hospital wards", ACTIVE, "2026-05", 14, 270, DEVELOPMENT_LOAN, "Habesha Construction & Design", 0.86, 1.03, 5),
        new Proj("Kahsay Abera General Hospital", "Full reconstruction of Kahsay Abera Hospital, Humera", PROCUREMENT, "2026-12", 20, 520, FEDERAL_TRANSFER, null, 1.0, 1.0, 0),
        new Proj("Alamata General Hospital", "Rehabilitation of Alamata General Hospital", ACTIVE, "2026-03", 12, 210, REGIONAL_TREASURY, "Nile Contractors PLC", 0.58, 1.18, 26),
        new Proj("Abiy Adi Primary Hospital", "Rehabilitation of Abiy Adi Primary Hospital", ACTIVE, "2026-05", 10, 95, DONOR_GRANT, "Tesfa Construction PLC", 1.04, 0.95, 2),
        new Proj("Hawzen Primary Hospital", "Reconstruction of Hawzen Primary Hospital", ACTIVE, "2026-06", 14, 160, DONOR_GRANT, "Selam Builders PLC", 0.47, 1.14, 38),
        new Proj("Korem Primary Hospital", "Rehabilitation of Korem Primary Hospital", ACTIVE, "2026-04", 10, 78, REGIONAL_TREASURY, "Nile Contractors PLC", 0.9, 1.0, 6),
        new Proj("Sheraro Primary Hospital", "Reconstruction of Sheraro Primary Hospital", PLANNED, "2027-02", 14, 150, FEDERAL_TRANSFER, null, 1.0, 1.0, 0),
        new Proj("Zalambessa Health Center", "Reconstruction of Zalambessa Health Center", ACTIVE, "2026-03", 9, 42, DIASPORA_FUND, "Selam Builders PLC", 0.93, 0.98, 3),
        new Proj("Edaga Arbi Health Center", "Rehabilitation of Edaga Arbi Health Center", COMPLETED, "2026-01", 6, 24, DONOR_GRANT, "Tesfa Construction PLC", 1.0, 0.99, 50),
        new Proj("Dawhan Health Center", "Reconstruction of Dawhan Health Center, Erob", ACTIVE, "2026-05", 10, 38, DIASPORA_FUND, "Habesha Construction & Design", 0.62, 1.07, 19),
        new Proj("May Gaba Health Center", "Reconstruction of May Gaba Health Center", ACTIVE, "2026-07", 10, 44, FEDERAL_TRANSFER, "Zenith Engineering PLC", 0.75, 1.05, 8),
        new Proj("Yechila Health Post", "Rehabilitation of Yechila Health Post", COMPLETED, "2026-02", 5, 6, REGIONAL_TREASURY, "Selam Builders PLC", 1.0, 1.0, 40),
        new Proj("Adi Daero Health Post", "Reconstruction of Adi Daero Health Post", ACTIVE, "2026-08", 6, 8, DIASPORA_FUND, "Tesfa Construction PLC", 1.1, 0.93, 1),
        new Proj("Endabaguna Health Post", "Rehabilitation of Endabaguna Health Post", COMPLETED, "2026-03", 5, 7, REGIONAL_TREASURY, "Selam Builders PLC", 1.0, 1.02, 20),
        // Manufacturing
        new Proj("Almeda Textile Factory", "Restart programme: Almeda Textile spinning and weaving lines", ACTIVE, "2026-02", 18, 1450, DEVELOPMENT_LOAN, "Mesfin Industrial Engineering", 0.72, 1.13, 10),
        new Proj("Addis Pharmaceutical Factory – Adigrat", "Rehabilitation of APF sterile production and utilities", ACTIVE, "2026-03", 15, 860, PRIVATE_INVESTMENT, "Ethiopian Construction Works Corporation", 0.95, 0.99, 3),
        new Proj("Sheba Leather Industry", "Rehabilitation of Sheba Leather tannery and effluent plant", ACTIVE, "2026-04", 14, 620, DEVELOPMENT_LOAN, "Zenith Engineering PLC", 0.84, 1.04, 6),
        new Proj("Mekelle Industrial Park", "Restoration of Mekelle Industrial Park sheds 4–9 and power", ACTIVE, "2026-01", 12, 980, FEDERAL_TRANSFER, "Defense Construction Enterprise", 1.0, 0.98, 2),
        new Proj("Maichew Particle Board Factory", "Reconstruction of Maichew Particle Board Factory", PROCUREMENT, "2026-11", 18, 540, PRIVATE_INVESTMENT, null, 1.0, 1.0, 0),
        new Proj("Saba Marble Factory", "Rehabilitation of Saba Marble processing hall", ACTIVE, "2026-06", 10, 210, PRIVATE_INVESTMENT, "Nile Contractors PLC", 0.66, 1.08, 15),
        new Proj("Humera Sesame Processing Plant", "Reconstruction of Humera Sesame Processing Plant", ACTIVE, "2026-05", 14, 470, DEVELOPMENT_LOAN, "Sur Construction PLC", 0.38, 1.25, 55),
        new Proj("Alamata Agro-Processing Plant", "Rehabilitation of Alamata Agro-Processing Plant", ACTIVE, "2026-07", 9, 160, REGIONAL_TREASURY, "Tesfa Construction PLC", 0.9, 1.01, 4),
        new Proj("Shire Grain Warehouse Complex", "Rehabilitation of Shire Grain Warehouse Complex", COMPLETED, "2026-01", 8, 130, DONOR_GRANT, "Tigray Construction Enterprise", 1.0, 0.96, 30),
        new Proj("Wukro Agro-Industrial Park", "Restoration of Wukro Agro-Industrial Park utilities", ACTIVE, "2026-04", 12, 390, FEDERAL_TRANSFER, "Habesha Construction & Design", 0.79, 1.06, 9),
        // Agriculture
        new Proj("Raya Valley Irrigation Scheme", "Rehabilitation of Raya Valley pressurised irrigation network", ACTIVE, "2026-01", 20, 1120, DEVELOPMENT_LOAN, "Ethiopian Construction Works Corporation", 0.87, 1.03, 3),
        new Proj("Tekeze Small-Scale Irrigation Scheme", "Rehabilitation of Tekeze small-scale irrigation canals", ACTIVE, "2026-03", 12, 240, DONOR_GRANT, "Tigray Water Works Construction Enterprise", 0.74, 1.07, 11),
        new Proj("Gereb Giba Irrigation Scheme", "Restoration of Gereb Giba dam intake and main canal", ACTIVE, "2026-02", 11, 180, REGIONAL_TREASURY, "Tigray Water Works Construction Enterprise", 0.98, 0.99, 2),
        new Proj("Humera Large-Scale Farm Irrigation", "Reconstruction of Humera pump stations and conveyance", PROCUREMENT, "2026-12", 24, 1600, FEDERAL_TRANSFER, null, 1.0, 1.0, 0),
        new Proj("Alamata Irrigation Scheme", "Rehabilitation of Alamata diversion weir and canals", ACTIVE, "2026-05", 10, 140, DONOR_GRANT, "Nile Contractors PLC", 0.61, 1.1, 24),
        new Proj("Werie Irrigation Scheme", "Rehabilitation of Werie irrigation scheme", ACTIVE, "2026-06", 9, 96, DIASPORA_FUND, "Tesfa Construction PLC", 0.92, 1.0, 5),
        new Proj("Hintalo Wajirat Veterinary Clinic", "Reconstruction of Hintalo Wajirat Veterinary Clinic", ACTIVE, "2026-07", 7, 14, REGIONAL_TREASURY, "Selam Builders PLC", 1.05, 0.97, 2),
        new Proj("Humera Veterinary Clinic", "Reconstruction of Humera Veterinary Clinic", PLANNED, "2027-01", 7, 15, REGIONAL_TREASURY, null, 1.0, 1.0, 0),
        new Proj("Axum Seed Multiplication Center", "Rehabilitation of Axum Seed Multiplication Center stores", ACTIVE, "2026-04", 9, 52, DONOR_GRANT, "Habesha Construction & Design", 0.89, 1.02, 7),
        new Proj("Shire-Maitsebri Agricultural Research Center", "Rehabilitation of Maitsebri research laboratories", ACTIVE, "2026-05", 12, 88, FEDERAL_TRANSFER, "Zenith Engineering PLC", 0.56, 1.16, 33),
        new Proj("Hawzen Farmers Training Center", "Reconstruction of Hawzen Farmers Training Center", ACTIVE, "2026-08", 8, 18, DIASPORA_FUND, "Tesfa Construction PLC", 0.96, 1.0, 3),
        new Proj("Ofla Farmers Training Center", "Rehabilitation of Ofla Farmers Training Center", COMPLETED, "2026-02", 6, 11, REGIONAL_TREASURY, "Selam Builders PLC", 1.0, 0.98, 35),
        new Proj("Medebay Zana Farmers Training Center", "Rehabilitation of Medebay Zana Farmers Training Center", CANCELLED, "2026-03", 6, 12, DONOR_GRANT, null, 0, 1.0, 0)
    );

    record MilestoneTemplate(String name, double weight, double at) {}
    static final List<MilestoneTemplate> BUILDING = List.of(
        new MilestoneTemplate("Site mobilisation & demolition", 10, 0.10), new MilestoneTemplate("Substructure complete", 25, 0.35),
        new MilestoneTemplate("Superstructure complete", 30, 0.65), new MilestoneTemplate("Finishing, MEP & furniture", 25, 0.90),
        new MilestoneTemplate("Commissioning & handover", 10, 1.0));
    static final List<MilestoneTemplate> IRRIGATION = List.of(
        new MilestoneTemplate("Survey, design & mobilisation", 10, 0.12), new MilestoneTemplate("Earthworks & headworks", 30, 0.40),
        new MilestoneTemplate("Canal lining & conveyance", 30, 0.70), new MilestoneTemplate("Hydraulic structures & pumps", 20, 0.92),
        new MilestoneTemplate("Testing & handover to WUA", 10, 1.0));
    static final List<MilestoneTemplate> INDUSTRIAL = List.of(
        new MilestoneTemplate("Damage audit & salvage", 10, 0.10), new MilestoneTemplate("Structural & utilities repair", 30, 0.40),
        new MilestoneTemplate("Machinery procurement & installation", 35, 0.78), new MilestoneTemplate("Testing & certification", 15, 0.94),
        new MilestoneTemplate("Production restart", 10, 1.0));

    record RiskTemplate(String title, String category, String likelihood, String impact, String mitigation) {}
    static final List<RiskTemplate> RISKS = List.of(
        new RiskTemplate("Cement and rebar price escalation", "MARKET", "HIGH", "HIGH", "Index-linked price adjustment clause; bulk procurement via regional framework"),
        new RiskTemplate("Delayed donor tranche release", "FINANCIAL", "MEDIUM", "HIGH", "Bridge financing from regional treasury; monthly donor liaison"),
        new RiskTemplate("Unexploded ordnance on site", "SAFETY", "LOW", "HIGH", "Clearance certificate before mobilisation; HALO Trust coordination"),
        new RiskTemplate("Shortage of skilled labour", "RESOURCE", "MEDIUM", "MEDIUM", "TVET graduate placement; contractor incentive scheme"),
        new RiskTemplate("Rainy season access constraints (kiremt)", "ENVIRONMENT", "HIGH", "MEDIUM", "Front-load earthworks; stockpile materials before June"),
        new RiskTemplate("Fuel supply interruption", "SUPPLY", "MEDIUM", "MEDIUM", "Regional fuel allocation quota for reconstruction sites"),
        new RiskTemplate("Design change requests from end users", "SCOPE", "MEDIUM", "LOW", "Design freeze after stakeholder sign-off; change control board"),
        new RiskTemplate("Contractor cash-flow stress", "FINANCIAL", "MEDIUM", "HIGH", "Advance payment guarantee; fortnightly IPC processing"));

    record IssueTemplate(String title, String severity, String description) {}
    static final List<IssueTemplate> ISSUES = List.of(
        new IssueTemplate("Interim payment certificate No. 3 pending for 42 days", "HIGH", "Contractor has reduced crew on site pending payment."),
        new IssueTemplate("Transformer not yet delivered by EEU", "HIGH", "Energising delayed; temporary generator costs accruing."),
        new IssueTemplate("Defective concrete batch in column pour", "MEDIUM", "Supervising engineer rejected pour; rework scheduled."),
        new IssueTemplate("Community dispute over access road alignment", "MEDIUM", "Wereda administration mediating; works continue on other fronts."),
        new IssueTemplate("Imported equipment held at Djibouti customs", "HIGH", "Clearance documents resubmitted; ETA +3 weeks."),
        new IssueTemplate("Water supply to site intermittent", "LOW", "Bowser hire arranged; cost impact minor."));

    static final String[] ASSESSORS = {"Haile Gebremariam", "Selam Tesfay", "Kidane Berhe", "Mulu Abraha", "Yohannes Teklu", "Tsige Hagos", "Berhane Kahsay", "Freweini Gebre"};
    static final String[] SITE_ENGINEERS = {"Eng. Daniel Araya", "Eng. Meron Hailu", "Eng. Tekle Woldu", "Eng. Senait Girmay", "Eng. Abraham Negash", "Eng. Hiwot Kiros"};
}
