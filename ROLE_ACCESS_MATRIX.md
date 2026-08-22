# Drishti Role Access Matrix

| Capability | Center Admin | School Admin | Evaluator | Scanner | Student |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sign in with email OTP | Yes | Yes | Yes | Yes | Yes |
| View school-scoped bundles | Yes | Yes | Assigned only | Own captures | Own results |
| Capture and submit sheets | Yes | No | No | Yes | No |
| Evaluate assigned papers | Yes | No | Yes | No | No |
| Manage staff and evaluator assignments | Yes | No | No | No | No |
| Resolve deviations and re-check requests | Yes | No | No | No | Request only |

Frontend navigation reflects these scopes, while server procedures and object-level checks enforce them.
