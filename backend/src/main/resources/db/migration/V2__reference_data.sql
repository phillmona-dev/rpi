-- ============================================================================
-- V2 · Reference data: roles and administrative geography (Region → Zone → Wereda)
-- Centroids are approximate representative points (town / wereda seat). Official
-- boundary polygons are loaded into `boundary` columns when supplied by CSA / EthioGIS.
-- ============================================================================
INSERT INTO role (code, description) VALUES
 ('EXECUTIVE',   'Chief Executive office: full read, decision actions'),
 ('SECTOR_HEAD', 'Sector bureau head: scoped to one sector, decision actions within sector'),
 ('ANALYST',     'Planning & monitoring analyst: full read, data entry'),
 ('PMO_FEDERAL', 'Federal / Prime Minister''s Office: read-only, audited'),
 ('FIELD_OFFICER','Field assessment officer: submits damage assessments'),
 ('SITE_MANAGER','Site engineer: submits progress logs for assigned projects'),
 ('ADMIN',       'System administrator: users, configuration, audit');

INSERT INTO region (code, name_en, name_ti, name_am) VALUES ('TG', 'Tigray', 'ትግራይ', 'ትግራይ');

INSERT INTO zone (region_id, code, name_en, name_ti, name_am, centroid) VALUES
 (1, 'TG-C',  'Central',       'ማእከላይ',       'ማዕከላዊ',      ST_SetSRID(ST_MakePoint(38.95, 14.05), 4326)),
 (1, 'TG-E',  'Eastern',       'ምብራቓዊ',       'ምስራቃዊ',      ST_SetSRID(ST_MakePoint(39.50, 14.10), 4326)),
 (1, 'TG-SE', 'South Eastern', 'ደቡብ ምብራቕ',   'ደቡብ ምስራቅ',   ST_SetSRID(ST_MakePoint(39.45, 13.25), 4326)),
 (1, 'TG-S',  'Southern',      'ደቡባዊ',        'ደቡባዊ',       ST_SetSRID(ST_MakePoint(39.52, 12.70), 4326)),
 (1, 'TG-NW', 'North Western', 'ሰሜን ምዕራብ',    'ሰሜን ምዕራብ',   ST_SetSRID(ST_MakePoint(38.20, 14.10), 4326)),
 (1, 'TG-W',  'Western',       'ምዕራባዊ',       'ምዕራባዊ',      ST_SetSRID(ST_MakePoint(36.95, 13.90), 4326)),
 (1, 'TG-MK', 'Mekelle',       'መቐለ',         'መቀሌ',        ST_SetSRID(ST_MakePoint(39.47, 13.49), 4326));

-- zone ids: 1 Central, 2 Eastern, 3 South Eastern, 4 Southern, 5 North Western, 6 Western, 7 Mekelle
INSERT INTO wereda (zone_id, code, name_en, name_ti, name_am, is_urban, population, centroid) VALUES
 -- Central
 (1, 'TG-C-01', 'Adwa',            'ዓድዋ',          'አድዋ',          FALSE, 112000, ST_SetSRID(ST_MakePoint(38.896, 14.166), 4326)),
 (1, 'TG-C-02', 'Adwa Town',       'ከተማ ዓድዋ',     'አድዋ ከተማ',     TRUE,   64000, ST_SetSRID(ST_MakePoint(38.900, 14.172), 4326)),
 (1, 'TG-C-03', 'Axum Town',       'ከተማ ኣኽሱም',    'አክሱም ከተማ',    TRUE,   76000, ST_SetSRID(ST_MakePoint(38.724, 14.121), 4326)),
 (1, 'TG-C-04', 'Laelay Maichew',  'ላዕላይ ማይጨው',   'ላዕላይ ማይጨው',   FALSE,  92000, ST_SetSRID(ST_MakePoint(38.680, 14.130), 4326)),
 (1, 'TG-C-05', 'Ahferom',         'ኣሕፈሮም',        'አህፈሮም',        FALSE, 190000, ST_SetSRID(ST_MakePoint(39.150, 14.280), 4326)),
 (1, 'TG-C-06', 'Werie Leke',      'ወርዒ ለኸ',       'ወርዒ ለኸ',       FALSE, 128000, ST_SetSRID(ST_MakePoint(38.950, 14.050), 4326)),
 (1, 'TG-C-07', 'Mereb Leke',      'መረብ ለኸ',       'መረብ ለኸ',       FALSE, 112000, ST_SetSRID(ST_MakePoint(38.780, 14.420), 4326)),
 (1, 'TG-C-08', 'Naeder Adet',     'ናዕዴር ዓዴት',     'ናዕዴር ዓዴት',     FALSE, 124000, ST_SetSRID(ST_MakePoint(38.750, 13.950), 4326)),
 (1, 'TG-C-09', 'Kola Tembien',    'ቆላ ተምቤን',      'ቆላ ተምቤን',      FALSE, 164000, ST_SetSRID(ST_MakePoint(38.850, 13.650), 4326)),
 (1, 'TG-C-10', 'Tanqua Abergele', 'ጣንቋ ኣበርገለ',    'ጣንቋ አበርገለ',    FALSE, 108000, ST_SetSRID(ST_MakePoint(38.950, 13.450), 4326)),
 (1, 'TG-C-11', 'Abiy Adi Town',   'ከተማ ዓቢ ዓዲ',    'አቢ አዲ ከተማ',    TRUE,   32000, ST_SetSRID(ST_MakePoint(39.002, 13.623), 4326)),
 -- Eastern
 (2, 'TG-E-01', 'Adigrat Town',    'ከተማ ዓዲግራት',   'አዲግራት ከተማ',   TRUE,   98000, ST_SetSRID(ST_MakePoint(39.462, 14.277), 4326)),
 (2, 'TG-E-02', 'Ganta Afeshum',   'ጋንታ ኣፈሹም',     'ጋንታ አፈሹም',     FALSE, 110000, ST_SetSRID(ST_MakePoint(39.400, 14.250), 4326)),
 (2, 'TG-E-03', 'Gulomekeda',      'ጉሎመኸዳ',        'ጉሎመከዳ',        FALSE, 104000, ST_SetSRID(ST_MakePoint(39.400, 14.420), 4326)),
 (2, 'TG-E-04', 'Erob',            'ኢሮብ',          'ኢሮብ',          FALSE,  32000, ST_SetSRID(ST_MakePoint(39.560, 14.370), 4326)),
 (2, 'TG-E-05', 'Saesie Tsaedaemba','ሳዕስዕ ጻዕዳእምባ', 'ሳዕስዕ ጻዕዳእምባ',  FALSE, 160000, ST_SetSRID(ST_MakePoint(39.550, 14.070), 4326)),
 (2, 'TG-E-06', 'Hawzen',          'ሓውዜን',         'ሃውዜን',         FALSE, 134000, ST_SetSRID(ST_MakePoint(39.433, 13.977), 4326)),
 (2, 'TG-E-07', 'Kilte Awlaelo',   'ክልተ ኣውላዕሎ',    'ክልተ አውላዕሎ',    FALSE, 118000, ST_SetSRID(ST_MakePoint(39.580, 13.780), 4326)),
 (2, 'TG-E-08', 'Wukro Town',      'ከተማ ውቕሮ',      'ውቅሮ ከተማ',      TRUE,   52000, ST_SetSRID(ST_MakePoint(39.600, 13.790), 4326)),
 (2, 'TG-E-09', 'Atsbi Wenberta',  'ኣጽቢ ወንበርታ',    'አጽቢ ወንበርታ',    FALSE, 128000, ST_SetSRID(ST_MakePoint(39.730, 13.870), 4326)),
 -- South Eastern
 (3, 'TG-SE-01','Enderta',         'እንደርታ',        'እንደርታ',        FALSE, 134000, ST_SetSRID(ST_MakePoint(39.550, 13.400), 4326)),
 (3, 'TG-SE-02','Hintalo Wajirat', 'ሕንጣሎ ዋጅራት',    'ሕንጣሎ ዋጅራት',    FALSE, 172000, ST_SetSRID(ST_MakePoint(39.550, 13.180), 4326)),
 (3, 'TG-SE-03','Samre Seharti',   'ሳምረ ስሓርቲ',     'ሳምረ ስሓርቲ',     FALSE, 146000, ST_SetSRID(ST_MakePoint(39.190, 13.170), 4326)),
 (3, 'TG-SE-04','Degua Tembien',   'ደጉዓ ተምቤን',     'ደጉዓ ተምቤን',     FALSE, 128000, ST_SetSRID(ST_MakePoint(39.170, 13.650), 4326)),
 -- Southern
 (4, 'TG-S-01', 'Alamata',         'ኣላማጣ',         'አላማጣ',         FALSE, 102000, ST_SetSRID(ST_MakePoint(39.558, 12.421), 4326)),
 (4, 'TG-S-02', 'Raya Azebo',      'ራያ ዓዘቦ',       'ራያ አዘቦ',       FALSE, 168000, ST_SetSRID(ST_MakePoint(39.640, 12.720), 4326)),
 (4, 'TG-S-03', 'Ofla',            'ኦፍላ',          'ኦፍላ',          FALSE, 152000, ST_SetSRID(ST_MakePoint(39.400, 12.500), 4326)),
 (4, 'TG-S-04', 'Endamehoni',      'እንዳመኾኒ',       'እንዳመኾኒ',       FALSE, 104000, ST_SetSRID(ST_MakePoint(39.450, 12.780), 4326)),
 (4, 'TG-S-05', 'Emba Alaje',      'እምባ ኣላጀ',      'እምባ አላጀ',      FALSE, 112000, ST_SetSRID(ST_MakePoint(39.500, 12.950), 4326)),
 (4, 'TG-S-06', 'Maichew Town',    'ከተማ ማይጨው',     'ማይጨው ከተማ',     TRUE,   44000, ST_SetSRID(ST_MakePoint(39.538, 12.783), 4326)),
 (4, 'TG-S-07', 'Korem Town',      'ከተማ ኮረም',      'ኮረም ከተማ',      TRUE,   28000, ST_SetSRID(ST_MakePoint(39.522, 12.509), 4326)),
 -- North Western
 (5, 'TG-NW-01','Shire Town',      'ከተማ ሽረ',       'ሽረ ከተማ',       TRUE,   96000, ST_SetSRID(ST_MakePoint(38.283, 14.102), 4326)),
 (5, 'TG-NW-02','Tahtay Koraro',   'ታሕታይ ቆራሮ',     'ታሕታይ ቆራሮ',     FALSE,  96000, ST_SetSRID(ST_MakePoint(38.400, 14.150), 4326)),
 (5, 'TG-NW-03','Medebay Zana',    'መደባይ ዛና',      'መደባይ ዛና',      FALSE, 148000, ST_SetSRID(ST_MakePoint(38.500, 14.100), 4326)),
 (5, 'TG-NW-04','Asgede Tsimbla',  'ኣስገደ ጽምብላ',    'አስገደ ጽምብላ',    FALSE, 162000, ST_SetSRID(ST_MakePoint(38.070, 14.050), 4326)),
 (5, 'TG-NW-05','Tselemti',        'ጸለምቲ',         'ጸለምቲ',         FALSE, 146000, ST_SetSRID(ST_MakePoint(38.150, 13.570), 4326)),
 (5, 'TG-NW-06','Laelay Adiabo',   'ላዕላይ ዓዲያቦ',    'ላዕላይ አዲያቦ',    FALSE, 128000, ST_SetSRID(ST_MakePoint(38.250, 14.300), 4326)),
 (5, 'TG-NW-07','Tahtay Adiabo',   'ታሕታይ ዓዲያቦ',    'ታሕታይ አዲያቦ',    FALSE, 112000, ST_SetSRID(ST_MakePoint(37.800, 14.400), 4326)),
 -- Western
 (6, 'TG-W-01', 'Kafta Humera',    'ቃፍታ ሑመራ',      'ቃፍታ ሁመራ',      FALSE, 118000, ST_SetSRID(ST_MakePoint(36.900, 14.100), 4326)),
 (6, 'TG-W-02', 'Humera Town',     'ከተማ ሑመራ',      'ሁመራ ከተማ',      TRUE,   38000, ST_SetSRID(ST_MakePoint(36.609, 14.288), 4326)),
 (6, 'TG-W-03', 'Welkait',         'ወልቃይት',        'ወልቃይት',        FALSE, 162000, ST_SetSRID(ST_MakePoint(37.300, 13.750), 4326)),
 (6, 'TG-W-04', 'Tsegede',         'ጸገዴ',          'ጸገዴ',          FALSE, 130000, ST_SetSRID(ST_MakePoint(36.950, 13.500), 4326)),
 -- Mekelle (special zone; sub-cities)
 (7, 'TG-MK-01','Ayder',           'ዓይደር',         'ዓይደር',         TRUE,   74000, ST_SetSRID(ST_MakePoint(39.480, 13.505), 4326)),
 (7, 'TG-MK-02','Hawelti',         'ሓወልቲ',         'ሃወልቲ',         TRUE,   68000, ST_SetSRID(ST_MakePoint(39.465, 13.495), 4326)),
 (7, 'TG-MK-03','Hadnet',          'ሓድነት',         'ሃድነት',         TRUE,   72000, ST_SetSRID(ST_MakePoint(39.455, 13.475), 4326)),
 (7, 'TG-MK-04','Kedamay Weyane',  'ቀዳማይ ወያነ',     'ቀዳማይ ወያነ',     TRUE,   66000, ST_SetSRID(ST_MakePoint(39.470, 13.488), 4326)),
 (7, 'TG-MK-05','Quiha',           'ቍሓ',           'ቁሓ',           TRUE,   58000, ST_SetSRID(ST_MakePoint(39.540, 13.470), 4326)),
 (7, 'TG-MK-06','Semien',          'ሰሜን',          'ሰሜን',          TRUE,   62000, ST_SetSRID(ST_MakePoint(39.475, 13.520), 4326)),
 (7, 'TG-MK-07','Adi Haki',        'ዓዲ ሓቂ',        'አዲ ሃቂ',        TRUE,   60000, ST_SetSRID(ST_MakePoint(39.490, 13.470), 4326));
