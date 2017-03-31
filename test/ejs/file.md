---
postProcessFilters: template-liquid,template-ejs
title: "AHAH"
---

# This is markdown

Hello this is a file

Hello <%= info.title %> this is in markdown!

## It's a hard life!


<div>
<%- JSON.stringify( info ); %>

<% var p = "\<\%= something \%\>" %>
<%- p %>
</div>

<h1>But is it working?</h1>

I don't know
