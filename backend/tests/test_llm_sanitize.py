from app.llm import sanitize_error_message


def test_sanitize_redacts_bearer_token_and_api_key() -> None:
    raw = (
        "Groq failed: Authorization: Bearer xyz "
        "api_key=gsk_notarealkeyvalue123"
    )
    redacted = sanitize_error_message(raw)

    assert "xyz" not in redacted
    assert "gsk_notarealkeyvalue123" not in redacted
    assert "[REDACTED]" in redacted
