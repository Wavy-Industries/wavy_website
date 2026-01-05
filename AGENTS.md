## Code style
- generally camel case
- define module level function above implementations.
- module level functions with a _ prefix
- public functions implemented before module level functions 
- prefer inlining logic. Only extract into functions if one can describe why it makes sense conceptually. Have this conceptual argument just before the function as a comment