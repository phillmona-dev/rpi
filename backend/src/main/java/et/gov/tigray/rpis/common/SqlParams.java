package et.gov.tigray.rpis.common;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;

import java.sql.Types;

/** Typed null-safe bind parameters; PostgreSQL needs the JDBC type to resolve `(:p IS NULL OR col = :p)`. */
public final class SqlParams {
    private SqlParams() {}
    /** Copies a parameter source preserving declared SQL types (needed for `:p IS NULL` on null binds). */
    public static MapSqlParameterSource copy(MapSqlParameterSource src) {
        MapSqlParameterSource out = new MapSqlParameterSource();
        for (String name : src.getParameterNames()) {
            int t = src.getSqlType(name);
            if (t == org.springframework.jdbc.core.namedparam.SqlParameterSource.TYPE_UNKNOWN) out.addValue(name, src.getValue(name)); else out.addValue(name, src.getValue(name), t);
        }
        return out;
    }
    public static MapSqlParameterSource scope(Sector sector, Short zoneId, Integer weredaId) {
        return new MapSqlParameterSource()
            .addValue("sector", sector == null ? null : sector.name(), Types.VARCHAR)
            .addValue("zoneId", zoneId, Types.SMALLINT)
            .addValue("weredaId", weredaId, Types.INTEGER);
    }
}
