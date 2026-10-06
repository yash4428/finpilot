package com.finpilot.web;

import com.finpilot.config.ApiException;
import com.finpilot.config.CurrentUser;
import com.finpilot.service.DashboardService;
import com.finpilot.service.TransactionService;
import com.finpilot.service.TransactionService.TxnInput;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/transactions")
public class TransactionController {
    private final TransactionService service;

    public TransactionController(TransactionService service) {
        this.service = service;
    }

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                          @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                          @RequestParam(required = false) String category,
                                          @RequestParam(required = false) String q) {
        return service.list(CurrentUser.id(), from, to, category, q).stream().map(DashboardService::txnView).toList();
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody TxnInput in) {
        return DashboardService.txnView(service.create(CurrentUser.id(), in));
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody TxnInput in) {
        return DashboardService.txnView(service.update(CurrentUser.id(), id, in));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id) {
        service.delete(CurrentUser.id(), id);
        return Map.of("deleted", id);
    }

    @PostMapping("/{id}/dismiss-anomaly")
    public Map<String, Object> dismiss(@PathVariable Long id) {
        return DashboardService.txnView(service.dismissAnomaly(CurrentUser.id(), id));
    }

    @PostMapping(value = "/import", consumes = "multipart/form-data")
    public Map<String, Object> importCsv(@RequestParam("file") MultipartFile file,
                                         @RequestParam(required = false) Long accountId) throws IOException {
        if (file.isEmpty()) throw ApiException.bad("Choose a CSV file to import");
        return service.importCsv(CurrentUser.id(), file.getInputStream(), accountId);
    }

    /** Re-run categorization + anomaly detection over history (used after seeding). */
    @PostMapping("/analyze")
    public Map<String, Object> analyze() {
        return service.analyze(CurrentUser.id());
    }
}
