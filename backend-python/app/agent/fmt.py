"""Formatting helpers shared by the agent and grounding check."""


def inr(v: float | int | None, paise: bool = False) -> str:
    """Indian digit grouping: 123456.0 -> ₹1,23,456."""
    if v is None:
        return "₹0"
    neg = v < 0
    v = abs(v)
    whole = int(round(v)) if not paise else int(v)
    s = str(whole)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    if paise:
        s += f".{int(round((v - int(v)) * 100)):02d}"
    return ("-" if neg else "") + "₹" + s
