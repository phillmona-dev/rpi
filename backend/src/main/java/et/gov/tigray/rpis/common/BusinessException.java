package et.gov.tigray.rpis.common;

import org.springframework.http.HttpStatus;

public class BusinessException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final java.util.List<java.util.Map<String, String>> errors;
    public BusinessException(HttpStatus status, String code, String message) { this(status, code, message, java.util.List.of()); }
    public BusinessException(HttpStatus status, String code, String message, java.util.List<java.util.Map<String, String>> errors) { super(message); this.status = status; this.code = code; this.errors = errors; }
    /** 400 carrying field-level violations in the same shape as bean validation ({field, message}). */
    public static BusinessException invalid(String message, java.util.List<java.util.Map<String, String>> errors) { return new BusinessException(HttpStatus.BAD_REQUEST, "validation_failed", message, errors); }
    public static BusinessException conflict(String code, String message) { return new BusinessException(HttpStatus.CONFLICT, code, message); }
    public static BusinessException badRequest(String code, String message) { return new BusinessException(HttpStatus.BAD_REQUEST, code, message); }
    public static BusinessException forbidden(String code, String message) { return new BusinessException(HttpStatus.FORBIDDEN, code, message); }
    public static BusinessException unauthorized(String code, String message) { return new BusinessException(HttpStatus.UNAUTHORIZED, code, message); }
    public HttpStatus getStatus() { return status; }
    public String getCode() { return code; }
    public java.util.List<java.util.Map<String, String>> getErrors() { return errors; }
}
