package com.finpilot.web;

import com.finpilot.config.CurrentUser;
import com.finpilot.service.TaxService;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

@RestController
@RequestMapping("/tax")
public class TaxController {
    private final TaxService tax;

    public TaxController(TaxService tax) {
        this.tax = tax;
    }

    /** Estimate from the saved tax profile. ?regime= only changes which one is "selected". */
    @GetMapping("/estimate")
    public Map<String, Object> get(@RequestParam(required = false) String regime) {
        return tax.estimateAndMaybeSave(CurrentUser.id(), null, null, regime, false);
    }

    public record TaxReq(BigDecimal grossIncome, Map<String, BigDecimal> deductions, String regime, Boolean save) {}

    /** What-if estimate; pass save=true to store it as the user's tax profile. */
    @PostMapping("/estimate")
    public Map<String, Object> post(@RequestBody TaxReq req) {
        return tax.estimateAndMaybeSave(CurrentUser.id(), req.grossIncome(), req.deductions(), req.regime(),
                Boolean.TRUE.equals(req.save()));
    }
}
