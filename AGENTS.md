## Code style
- generally camel case
- define module level function above implementations.
- module level functions with a _ prefix
- public functions implemented before module level functions 
- prefer inlining logic. Only extract into functions if one can describe why it makes sense conceptually. Have this conceptual argument just before the function as a comment
- good design when the UI as truthfully and as directly represents the underlying data. The logic between the data and the UI should be as simple as possible. If its compelex, it might suggest we are not structuring the data correctly or the UI is wrong.
