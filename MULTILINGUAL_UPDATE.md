# Multilingual update

- Added VI / EN / JA language selector; Vietnamese is the default.
- Added client-side dictionaries and dynamic-content translation handling.
- Persisted the language preference in browser storage and account state.
- Extended the backend language validation and Gemini prompt language selection to Japanese.
- AI chart interpretation, daily reflection, and journal review use the active language.
- Journal entries and library references retain language metadata; user-authored content is preserved verbatim.
- Kept legacy Chinese birth-profile values readable for backwards compatibility.

Validation performed: JavaScript syntax checks, Python compilation, and 16 existing pytest tests passed.
