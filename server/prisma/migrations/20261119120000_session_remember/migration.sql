-- D-68: sign-ins end after an hour unused unless "Keep me signed in" was ticked.
ALTER TABLE "refresh_tokens" ADD COLUMN     "remember" BOOLEAN NOT NULL DEFAULT false;

-- Sign-ins made before this change weren't asked, so they count as not remembered:
-- each gets at most one idle hour from now.
UPDATE "refresh_tokens" SET "expiresAt" = LEAST("expiresAt", NOW() + INTERVAL '1 hour');
