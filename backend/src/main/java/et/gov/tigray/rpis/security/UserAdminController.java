package et.gov.tigray.rpis.security;

import et.gov.tigray.rpis.common.PageResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/users")
@RequiredArgsConstructor
@Tag(name = "Administration · Users")
public class UserAdminController {
    private final UserAdminService service;

    @GetMapping
    public PageResponse<AuthDtos.UserSummary> list(@ParameterObject @PageableDefault(size = 25, sort = "username", direction = Sort.Direction.ASC) Pageable pageable) {
        return PageResponse.of(service.list(pageable));
    }

    @GetMapping("/{id}")
    public AuthDtos.UserSummary get(@PathVariable Long id) { return service.get(id); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AuthDtos.UserSummary create(@Valid @RequestBody AuthDtos.CreateUserRequest req) { return service.create(req); }

    @PatchMapping("/{id}")
    public AuthDtos.UserSummary update(@PathVariable Long id, @Valid @RequestBody AuthDtos.UpdateUserRequest req) { return service.update(id, req); }

    @PostMapping("/{id}/unlock")
    public AuthDtos.UserSummary unlock(@PathVariable Long id) { return service.unlock(id); }
}
