package et.gov.tigray.rpis.common;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** RFC 7807 Problem Details for every error, always carrying the correlation id for support. */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private ProblemDetail base(HttpStatus status, String title, String detail, HttpServletRequest req) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, detail);
        pd.setTitle(title);
        pd.setType(URI.create("https://rpis.tigray.gov.et/problems/" + title.toLowerCase().replace(' ', '-')));
        pd.setInstance(URI.create(req.getRequestURI()));
        pd.setProperty("timestamp", Instant.now().toString());
        pd.setProperty("correlationId", MDC.get(CorrelationIdFilter.MDC_KEY));
        return pd;
    }

    @ExceptionHandler(NotFoundException.class)
    public ProblemDetail notFound(NotFoundException ex, HttpServletRequest req) {
        return base(HttpStatus.NOT_FOUND, "Not Found", ex.getMessage(), req);
    }

    @ExceptionHandler(BusinessException.class)
    public ProblemDetail business(BusinessException ex, HttpServletRequest req) {
        ProblemDetail pd = base(ex.getStatus(), "Business Rule Violation", ex.getMessage(), req);
        pd.setProperty("code", ex.getCode());
        if (!ex.getErrors().isEmpty()) pd.setProperty("errors", ex.getErrors());
        return pd;
    }

    /*
     * Extending ResponseEntityExceptionHandler keeps Spring's handling of framework exceptions (405, missing parameters, …)
     * and stops Boot registering its own ProblemDetails handler, which would otherwise answer validation errors first and
     * drop the per-field list the forms rely on.
     */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail pd = base(HttpStatus.BAD_REQUEST, "Validation Failed", "One or more fields are invalid", ((ServletWebRequest) request).getRequest());
        List<Map<String, String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> Map.of("field", fe.getField(), "message", String.valueOf(fe.getDefaultMessage())))
                .toList();
        pd.setProperty("errors", errors);
        return ResponseEntity.badRequest().body(pd);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return ResponseEntity.badRequest().body(base(HttpStatus.BAD_REQUEST, "Bad Request", "The request body could not be read: " + ex.getMostSpecificCause().getMessage(), ((ServletWebRequest) request).getRequest()));
    }

    @ExceptionHandler({ConstraintViolationException.class, MethodArgumentTypeMismatchException.class})
    public ProblemDetail badRequest(Exception ex, HttpServletRequest req) {
        return base(HttpStatus.BAD_REQUEST, "Bad Request", "The request could not be processed: " + ex.getMessage(), req);
    }

    @ExceptionHandler({BadCredentialsException.class})
    public ProblemDetail badCredentials(Exception ex, HttpServletRequest req) {
        return base(HttpStatus.UNAUTHORIZED, "Authentication Failed", "Invalid username or password", req);
    }

    @ExceptionHandler(LockedException.class)
    public ProblemDetail locked(LockedException ex, HttpServletRequest req) {
        return base(HttpStatus.LOCKED, "Account Locked", ex.getMessage(), req);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ProblemDetail denied(AccessDeniedException ex, HttpServletRequest req) {
        return base(HttpStatus.FORBIDDEN, "Access Denied", "You do not have permission to perform this action", req);
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail generic(Exception ex, HttpServletRequest req) {
        log.error("Unhandled exception [{}]", MDC.get(CorrelationIdFilter.MDC_KEY), ex);
        return base(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error",
                "An unexpected error occurred. Quote the correlation id when contacting support.", req);
    }
}
