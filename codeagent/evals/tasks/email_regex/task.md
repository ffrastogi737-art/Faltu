`is_valid_email` accepts `a@b` (no dot in the domain) and `a b@c.com` (space). Reject those; keep accepting normal addresses like `x.y+z@mail.example.in`.
