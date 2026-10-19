package et.gov.tigray.rpis.common;

public class NotFoundException extends RuntimeException {
    public NotFoundException(String entity, Object id) { super(entity + " " + id + " was not found"); }
}
