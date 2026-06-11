"""Auth layer (Plan 1.5): passwords, session tokens, and the tenancy seam.

Lives in ``app/auth`` (not ``app/security``) because ``app/security.py`` is an
existing module that owns request-level middleware concerns.
"""
