---
layout: page.html
testing: 10000
listLatest:
  _ALL_: 10
  category.security: 15
---

# Header

Hello, _this is a test_ to see if **this** thing {{ info.testing }} works!


{% say_hello pppp %}

{%capture template%}
  {% include _included.html %}
{%endcapture%}
{{ template | camelize }}

TEMPLATE:
END
