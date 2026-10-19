package et.gov.tigray.rpis.common;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;

/** WGS-84 point exposed by the API as {lat, lng}. */
public record GeoPoint(double lat, double lng) {
    private static final GeometryFactory FACTORY = new GeometryFactory(new PrecisionModel(), 4326);

    public static GeoPoint of(Point p) {
        return p == null ? null : new GeoPoint(p.getY(), p.getX());
    }

    public Point toJts() {
        return FACTORY.createPoint(new Coordinate(lng, lat));
    }

    public static Point jts(double lat, double lng) {
        return FACTORY.createPoint(new Coordinate(lng, lat));
    }
}
