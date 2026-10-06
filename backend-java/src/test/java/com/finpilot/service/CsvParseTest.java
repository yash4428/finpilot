package com.finpilot.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CsvParseTest {
    @Test
    void handlesQuotedCommas() {
        assertEquals(List.of("2026-10-01", "Amazon, Inc", "Order \"A\"", "-499"),
                TransactionService.parseCsvLine("2026-10-01,\"Amazon, Inc\",\"Order \"\"A\"\"\",-499"));
    }
}
