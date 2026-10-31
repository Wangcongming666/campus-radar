package com.campusradar.common;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiErrors {
    private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);
    record ErrorDetail(String code, String message, String requestId) {}
    record ErrorEnvelope(ErrorDetail error) {}

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<ErrorEnvelope> databaseUnavailable(DataAccessException exception) {
        String requestId = UUID.randomUUID().toString();
        log.error("Database error, requestId={}", requestId, exception);
        var error = new ErrorDetail("DEPENDENCY_UNAVAILABLE", "服务暂时不可用，请稍后重试。", requestId);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).cacheControl(CacheControl.noStore())
                .header("X-Request-Id", requestId).body(new ErrorEnvelope(error));
    }
    @ExceptionHandler(ApiProblem.class)
    ResponseEntity<ErrorEnvelope> problem(ApiProblem exception) {
        String id = UUID.randomUUID().toString();
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .header("X-Request-Id",id).body(new ErrorEnvelope(new ErrorDetail(exception.code(),exception.getMessage(),id)));
    }
    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
    ResponseEntity<ErrorEnvelope> validation(org.springframework.web.bind.MethodArgumentNotValidException exception) {
        return problem(new ApiProblem(422,"VALIDATION_ERROR","请检查必填字段、长度和格式。"));
    }
    @ExceptionHandler({jakarta.validation.ConstraintViolationException.class,org.springframework.web.method.annotation.HandlerMethodValidationException.class})
    ResponseEntity<ErrorEnvelope> constraints(Exception exception) {
        return problem(new ApiProblem(422,"VALIDATION_ERROR","请求参数缺失或格式不正确。"));
    }
    @ExceptionHandler({org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,org.springframework.web.bind.MissingServletRequestParameterException.class,org.springframework.web.bind.MissingRequestHeaderException.class})
    ResponseEntity<ErrorEnvelope> arguments(Exception exception) {
        return problem(new ApiProblem(422,"VALIDATION_ERROR","请求参数缺失或格式不正确。"));
    }
    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    ResponseEntity<ErrorEnvelope> json(org.springframework.http.converter.HttpMessageNotReadableException exception) {
        return problem(new ApiProblem(400,"INVALID_JSON","请求体格式不正确或包含不支持的字段。"));
    }
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ResponseEntity<ErrorEnvelope> upload(org.springframework.web.multipart.MaxUploadSizeExceededException exception) {
        return problem(new ApiProblem(413,"PAYLOAD_TOO_LARGE","附件超过上传限制。"));
    }
}
