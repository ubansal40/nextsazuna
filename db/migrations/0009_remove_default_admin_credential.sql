-- 0009_remove_default_admin_credential.sql
--
-- Delete the reference's shipped admin login, if it is still the shipped one.
--
-- Migration 0001 inherited the Express schema's seed: `admin@sazuna.com` with a
-- committed bcrypt hash of `Admin@1234`. A working credential in the repository
-- is a working credential on the deployed site — anyone who reads the schema can
-- sign in. The rebuild's answer is that the first admin is created by
-- `npm run admin:create` with a password that exists nowhere in git, so the
-- default has no reason to survive.
--
-- The delete is CONDITIONAL on the hash still being the committed one. If the
-- owner has already reset this account's password (via admin:create, which
-- updates the hash in place), the row no longer matches and is left untouched —
-- so this cannot lock out an operator who adopted `admin@sazuna.com` as their
-- real account. It only removes the credential while it is still the insecure
-- default.
--
-- After this runs on a fresh database there is NO admin account until one is
-- created by script. That is the intended secure default: no account is safer
-- than an account whose password is in the git history. `admin_sessions` has
-- ON DELETE CASCADE, so any session for the default row goes with it.

DELETE FROM admin_users
 WHERE email = 'admin@sazuna.com'
   AND password_hash = '$2b$10$Cn3uRQCtNv2RKj0TfPTpruSQEzzzwxuZEivCir4bHbgpPkB2UqJd.';
