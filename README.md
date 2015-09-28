# Ryver

Ryver is the most powerful, extensible web site generator available. It's blazing fast, written in NodeJS, and using Yaml to configure how it works. You can use it to create powerful template-based static websites easily, and extend it adding simple hooks and filters.

## Install Ryver

To install Ryver, simply type:

    npm install -g ryver

And you should be good to go. After installation, you will end up with a "ryver" executable ready to work its magic.

## Using Ryver

This guide will use you through every single possible way of using Ryver. It will start with its simple usage using its default plugins, up to the most advanced uses.

### Hello world

First of all, create two directories called `src` and `_site` by running `mkdir src` and `mkdir _site`.

At this point, you are good to go. Run:

    ryver src

The result (which is... nothing) will be placed in `_site`.

`_site` happens to be the default destination directory: you can change it to whatever you like by providing a second parameter:

    ryver src somewhere

In this case, `somewhere` will contain the result of your hard work.

Note that you can set, as a destination directory, somewhere _within_ `src` like so:

    ryver src src/somewhere

This won't bother Ryver -- that is, Ryver won't scan `src/somewhere` as part of its input to generate your site.

In this guide, I will assume that you simply run `ryver src` and see your results in `_site`.

Since this chapter is about "Hello world", it's about time to create a file called `hello_world.md` in your source directory, and run `ryver src`.

You will see that an _identical_ copy of `hello_world.md` will be placed in `_site`.

Since this guide is meant to show what Ryver is capable of, let's automatically transform `hello_world.md` into `hello_world.html`.

Place a file called `_info.yaml` into your `src` folder, so that it contains:

    filters: markup-markdown

This _info directive_ will apply to every file in that directory, as well as any file in nested directories.

By running `ryver src` again, you will see that a new file, `hello_world.html`, was created and contained:

    <h1 id="hello-world-">Hello world!</h1>

The Markdown processing obviously worked. You probably noticed that `_info.yaml` wasn't copied over: that is because _all files and directories starting with an underscore are not filtered, and therefore not copied over_.

The `markup-markdown` filter will make sure that any file with the extension `.md` will be processed as Markdown.

The `markup-markdown` filter is provided by the plugin `ryver-markup-markdown`, which will filter every file with extension `.md` into HTML, as well as renaming them to `.html`

What you learned in this chapter:

* `ryver src` is the same as `ryver src _site`: it will process all files in `src` recursively, and will use `_site` as output
* `ryver src src/_site` is allowed (files in `src/_site` will not be considered part of the input)
* Without any filtering instructions, files are simply copied over -- except the ones starting with `_` (underscore), which are ignored
* The file `_info.yaml` is important in Ryver since it tells Ryver how what to do with files in that directory _as well as any nested directory_.
* By having `filters: markup-markdown` in your `_info.yaml`, you are telling Ryver that any file with the extenion `.md` will need to be filtered as Markdown and renamed to `.html`.

### The frontmatter

Ryver allows you to define a frontmatter for every file. The frontmatter allows you to define some variables which will only apply to that page.

The variables you set might be for your own use (to be displayed in the templates) or could be useful to Ryver's plugins to know how to do their jobs.

For example, you might decide to turn off `filters` for a specific file; create a file called `not_filtered.md` like so:

    ---
    filters:
    ---
    # Hello boring world

After running `ryver src`, you will see that there is an extra file in the `_site` directory, but it's called `not_filtered.md` -- and it's still plain boring Markdown (it didn't get filtered). Notice however that the frontmatter _did_ get filtered out of the end result.

**NOTE**: Remember to wipe out the `_site` directory as running `ryver src` doesn't delete old files left over by previous runs.

The variables in the frontmatter have priority over the ones defined in `_info.yaml`. Since `filters` is set to empty in the frontmatter, the file will not get filtered.

The frontmatter ability is provided by the plugin `ryver-frontmatter`.

What you learned in this chapter:

* Files can have a _frontmatter_, which can be used to change user variables, as well as module variables which will change the way a file will get filtered.
* Variables in the frontmatter have priority over variables set in `_info.yaml`.

### Liquid template and more variables

One of Ryver's filters is `template-liquid`, which allows you to process Liquid directives within your file.
You can activate Liquid for a specific file using its frontmatter. Imagine you have:

    ---
    title: Hello world!
    population: 6000000
    postProcessFilters: template-liquid
    ---
    # {{info.title}}

    Your population is {{info.population}}

Running `ryver src` will output the following file:

    <h1 id="hello-world-">Hello world!</h1>
    <p>Your population is 6000000</p>

Note that the file was filtered by Markdown because of `filters: markup-markdown` in the `_info.yaml` file in the directory.

The `template-liquid` filter is provided by the plugin `ryver-template-liquid`. It may seem silly to add variables and then reference them in the templates directly like I did. However, their importance is more evident when you add more plugin to the mix, since plugins can (and will) create interesting (and useful!) variables.

What you learned in this chapter:

* You can enable the `template-liquid` filter by adding it to the `postProcessFilters` variable, enabling powerful templating based on variables.
* Variables in the frontmatter are accessible with in the `info.` namespace (or the `info` object)
* One of the things plugins do is provide extra variables for you to use

### Nested directories and variables

It's important now to take a deep breath and realise the power of Ryver and its variable system. When you have a `_info.yaml` file in a directory, the variables set there will be available to every filtered file in that directory, as well as _every filtered file in any nested directory_.

This means that for every directory you can have a "master" `_info.yaml` file, where you set variables to sane values, but then you can redifine _some_ (of all) of the values in sub-directories creating a `_info.yaml` file inside each one. And then, again, you can have files defining variables themselves using their own frontmatter.

This implies that you will want the _generic_ settings for variables in the site's "main" `_info.yaml` file, and then get more and more specific as you go deeper into the file system.

What you learned in this chapter:

* Variables set in `_info.yaml` files will influence variables for every filtered file in that directory and in any subsirectory. Frontmatter in files will also redefine variables on a per-file basis.

### Filtering lifecycle

At this point, you saw two cases where filtering was added: setting the `filters` variable, and setting the `postProcessFilters` variable.

The basics of Ryver are simple: every file is filtered by the specified filters. Filters are made available by _plugins_. By default, all plugins available in stock Ryver are loaded (although this can be changed).

You can decide what filters will apply to a file by setting the following phases:

* `preProcessFilters`.
* `preFilters`.
* `filters`.
* `postFilters`.
* `postProcessFilters`.

Generally speaking, you can place a filter anywhere here. However, some filters might need to be placed in specific spots. For example, you want `template-liquid` to have some action only when _all_ variables have been set by other plugins. The only time when you are _guaranteed_ that that will have happen is at `postProcessfilters` time.

The stages are there mainly for grouping convenience. You can use all of them, or only a subset depending on how you want to organise your site. For example, it's common to only really use three of them, and set something like this in your `_info.yaml` file:

    preFilters:
    filters: markup-markdown
    postFilters: layout

This will set a general behaviour you want nearly every page to have. I haven't yet explained the `layout` filter, but its meaning is pretty straightforward (it will place the contents of each file into a specified template). Generally speaking, every HTML page will have a layout, and it will be filtered as Markdown first (before being placed in the layout, obviously).

For some inner pages, you might want to add more filters but still have `layout` there. So, in an inner directory, you might set:

    filters: markup-markdown,pager

This will only affect pages within that subdirectory, and the `postFilters` variable will be untouched. So, `layout` will still be applied, along with `markup-markdown` and `pager` -- which is what you want.

Basically, the five different stages are there to help you group what filters apply where. The scenario above is the most common one, but having five different groups five you the freedom to deal with the most complex scenarios.

The only special phase is `postProcessFilters`: filters will be able to run once _all_ of the variables set by other plugins are fully set (which is why `template-liquid`, which is often used for variable substitution, is placed there).

What you learned in this chapter:

* You can plce filters in whichever phase you like, depending on how you decide to group them
* All phases are equal, except `postProcessFilters` which guarantees that all variables set by plugins are set.
* You should use grouping to simplify how you redefine filters according to filter definition in `_info.yaml`. You will usually put the most common case in the root `_info.yaml`, and then redefine specific groups in inner directories.

### Ryver's `_config.yaml` file

Some of Ryver's plugins are configurable. If you place a file called `_config.yaml` in Ryver, you will be able to change some of the default configuration settings.

Ryver uses the config file to those settings that are 1) Global in scope 2) Affecting how a plugin will work.

For example, in `_config.yaml` you can define the list of plugins installed by default by Ryver, or where the layout files are (for the layout plugin). This sort of setting is global in scope, meaning that it wouldn't make sense to have it in `_info.yaml` (which has a per-directory scope) or in the file's frontmatter.

I will now explain several filters; for each one, I will explain what confguration options you have in `_config.yaml` (which, I remind you, should be at the root of your source directory).

What you learned in this chapter:

* You can have a global config file called `_config.yaml` in the root of your source directory called
* The `_config.yaml` file has global confguration options for plugins and filters

### Layout

This is probably one of the most important plugins in Ryver. It allows you to place the contents of a file into a template.

For example, create a file called `templateHelloWorld.md` with the following contents:

    ---
    layout: page.html
    postFilters: layout
    ---
    # Hello world!
    Mind you, it's a templated world!

Running Ryver will result in an error:

`Ryver · ENOENT, open 'src/_layouts/page.html'``

This error is there because Ryver expects, by default, to find `page.html` (the template file) in the `_layouts` directory. (NOTE: the `_layouts` directory will _not_ be in the resulting site since its name starts with an underscore).

So, create a `_layouts` directory in the root of your source directory, and place a `page.html` file as follows:

    <!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN"
        "http://www.w3.org/TR/html4/strict.dtd">
    <html lang="en">
      <head>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
        <title>The title!</title>
      </head>
      <body>

    <!--contents-->

      </body>
    </html>

Note that this is a minimalistic HTML file, with a placeholder -- `<!--contents-->` that will instruct Ryver where to place the filtered page.

If you run `ryver src`, you will see that the resulting `templateHelloWorld.md` will be created like so:

    <!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN"
        "http://www.w3.org/TR/html4/strict.dtd">
    <html lang="en">
      <head>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
        <title>The title!</title>
      </head>
      <body>

    <h1 id="hello-world-">Hello world!</h1>
    <p>Mind you, it’s a templated world!</p>

      </body>
    </html>

Note that this is the first time we do something actually useful using Ryver: yo had a simple Markdown file called `templateHelloWorld.md` and produced, as a result, a functioning and well formatted HTML file called `templateHelloWorld.html`.

Don't forget that the `markup-markdown` filter was applied because you have a `_info.yaml` file in the root of your source directory, with the following:

    filters: markup-markdown

Finally, you can configure the layout plugin to change the name of the `_layouts` directory, by placing something like this in your `_config.yaml` file:

`includesFolder: _alternativeIncludes`

It's important for the directory name to start with an underscore, so that it won't be copied over to the final result.

What you learned in this chapter:

* You can filter contents though the `layout` filter, which will place the contents within a template with `postFilters: layout` in your frontmatter
* In order for filtering to do anything, you need to have a `layout` variable set (on a per-directory bases, in a `_info.yaml` file, or in your frontmatter). E.g. `layout: page.html` will use the template in `_includes/page.html`
* The template file will be just text, with the special placeholder `<!--contents-->` which will be replaced with the contents of the file

### Layout and liquid together

If you worked with HTML generators before, you probably noticed an eye-sore in the `page.html` file:

    <title>The title!</title>

This implies tht every single page using `page.html` as a template will have `The title!` as their HTML title. This is hardly ideal.

To make things really shine, you can -- and in fact -- use the layout and the liquid filter together.

Change `page.html` like so:

    <!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN"
        "http://www.w3.org/TR/html4/strict.dtd">
    <html lang="en">
      <head>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
        <title>{{info.title}}</title>
      </head>
      <body>

    <!--contents-->

      </body>
    </html>

Also, change `templateHelloWorld.md` like so:

    ---
    layout: page.html
    postFilters: layout
    postProcessFilters: template-liquid

    title: It's a template title!
    ---
    # Hello world!
    Mind you, it's a templated world!


The result will me much better:

    <!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN"
        "http://www.w3.org/TR/html4/strict.dtd">
    <html lang="en">
      <head>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
        <title>It's a template title!</title>
      </head>
      <body>

    <h1 id="hello-world-">Hello world!</h1>
    <p>Mind you, it’s a templated world!</p>

      </body>
    </html>

This is what happened in terms of filtering. The file had the following fiters set:

* `filters: markup-markdown` (from `_info.yaml`)
* `postFilters: layout` (from the file's frontmatter)
* `postProcessFilters: template-liquid` (from the file's frontmatter)

So, the filters will be applied in the following order: `markup-markdown`, `layout`, `template-liquid`.

After `markup-markdown`, the contents will go from:

    # Hello world!
    Mind you, it's a templated world!

To:

    <h1 id="hello-world-">Hello world!</h1>
    <p>Mind you, it’s a templated world!</p>

Note that the file's name will also change to `templateHelloWorld.html` (the filter will actually rename the file).

After `layout`, the contents will be placed accodding to the placeholder in `page.html`, and the contents will be transformed into:

    <!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN"
        "http://www.w3.org/TR/html4/strict.dtd">
    <html lang="en">
      <head>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
        <title>{{info.title}}</title>
      </head>
      <body>

    <h1 id="hello-world-">Hello world!</h1>
    <p>Mind you, it’s a templated world!</p>

      </body>
    </html>

After `template-liquid`, all of the `liquid` directives will be executed, including `{{info.title}}`, and the contents will be transformed into:

    <!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN"
        "http://www.w3.org/TR/html4/strict.dtd">
    <html lang="en">
      <head>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
        <title>It's a template title!</title>
      </head>
      <body>

    <h1 id="hello-world-">Hello world!</h1>
    <p>Mind you, it’s a templated world!</p>

      </body>
    </html>

As you can see, _the order in which the filters are executed actually matters_. If you ran the `template-liquid` filter before `layout`, the variable `{{info.title}}` would never be resolved. If you ran `markup-markdown` after `layout`, the markdown filter would not work since it wouldn't compile anything within a `<div>` (which would be the case, since the contents would already be placed in the layout).

The order in which you should execute the filters is the natural order in which you would process the contents. This will become more evident with the next two filters I will explain.

What you learned in this chapter:

* The order in which filters are applied is important, as it needs to make sense
* Variable substitution (with `template-liquid`) should happen after `layout`, so that any liquid tags in the template file will actually be compiled
* The filter `template-liquid` (or any filter that does variable-substitution) should be called in `postProcessFilters`, which is the only special stage

### Pager

You sometimes want to split your contents into separate pages. Ryver majes this very simple, by using the `pager` plugin.

Create a file like so:

    ---
    layout: page.html
    preFilters: pager
    postFilters: layout
    postProcessFilters: template-liquid

    title: It's a template title!
    ---

    # Hello there

    This is a file that will end up split into several ones.
    The way it works is really simple, and yet very powerful.

    This is the end of the first page.

    <!--pagebreak-->

    This is the second page.

    <!--pagebreak-->

    This is the third page.

    <!--pagebreak-->

    This is the fourth (and last) page.

Once you run `ryver src`, you will see that four files were actually created:

* `paged.html`
* `paged_2.html`
* `paged_3.html`
* `paged_4.html`

So, the final result, rather than being a whole file, is four different slices where each slice is marked by `<!--pagebreak-->`.

You can decide both the separator and the pattern of the "paged" file names in your `_config.yaml` file. For example you could have:

    pageFileName: 'another_page{{originalName}}_{{number}}'
    pageSeparator: '<!--anotherPagebreak-->'

#### Variables available in the pages

While having split files is very useful, what's really crucial is being able to know, within the page, enough information to create a "pager" and actually navigate to the next page. Crucial information is for example:

* The page number
* The total number of pages
* The name of the "next" page
* The name of the "previous" page
* An array with all the available pages, where each element has a page number, a page name, and a flag set to `true` if the page in the pager is the same as the displayed one

Luckily, all of this information is made available by the `pager` plugin to every single page, through the followng variables (in `info.pagerData`):

* `pageNumber`
* `totalPages`
* `prevPageName`
* `nextPageName`
* `pager[]` (an array where each element has the following attributes)
  *  `pageNumber`
  *  `pageName`
  *  `thisPage`

Using liquid, you can easily create a powerful pager with something like this to show a working, themable pager:

    <!-- This loops through the paginated posts -->
    <div class="pager">
      <ul>
      {% for page in info.pagerData.pager %}
        {% if page.thisPage %}
        <li><p class="this_page">{{page.pageNumber}}</p></li>
        {% else %}
        <li><a href="{{page.pageName}}{{system.fileExt}}" class="this_page">{{page.pageNumber}}</a></li>
        {% endif %}
      {% endfor %}
      </ul>
    </div>

The code is very basic: it goes through all of the elements in info.pagerData.pager, and provides either a link to the page, or simply a page number (in case you are viewing that very page).

Note the use of `{{system.fileExt}}` to make up the link with the page's name plus the page's extenson.
Making _previous_ and _next_ links is just as easy:

    <!-- Prev and Next links -->
    <div class="pagination">

      <!-- Prev link -->
      {% if info.pagerData.prevPageName %}
      <a href="{{ info.pagerData.prevPageName }}{{system.fileExt}}" class="previous">Previous</a>
      {% else %}
      <span class="previous">Previous</span>
      {% endif %}

      <!-- page number -->
      <span class="page_number ">Page: {{ info.pagerData.pageNumber }} of {{ info.pagerData.totalPages }}</span>

      <!-- Next link -->
      {% if info.pagerData.nextPageName %}
      <a href="{{ info.pagerData.nextPageName }}{{system.fileExt}}" class="previous">Next</a>
      {% else %}
      <span class="next">Next</span>
      {% endif %}
    </div>

Since you only want to provide the pager and navigation to pages that are actually sliced up, you should surround any pger code with:

    {% if info.pagerData %}
    ...
    {% endif %}

Earlier in this guide I mentioned how some filters created important variables, as well as filtering files. This is the prime example of this mechanism at work: the `pager` plugin splits files in slices, and also (more importantly) sets several variables on those files so that the users know which slice they are a looking at.

What you learned in this chapter:

* You can split files up using the `pager` plugin
* You can configure both the separator (`pageSeparator`) and the pattern used to create pages (`pageFileName`) setting those values in `_config.yaml`. The default values are `<!--pagebreak-->` and `{{originalName}}_{{number}}`.
* The sliced up pages have a `pagerData` variable that you should use to make up navigation and pager with

### Landing

In some cases, you might want to create a "landing" page: a page that users will see, and that will then link to the real contents.

You can do this with the `landing` filter.

TODO

### Lister

The most powerful (and complex) plugin in Ryver is `lister`, which allows you to create a number of categories, and then "attach" any post to any categories amongst the available ones.

The most common example is the possibility of wanting `tags` and `category` for your posts. This means that a post could have something like this it its frontmatter:

---
---

Unlike other plugins, `lister` needs to be configured in order to work (since it's not really possible to set it with sane defaults).

TODO

### Ryver plugins

When you use Ryver, you are actually using it with

TODO

### Ryver watcher

Ryver allows you to work on file and only regenerate what's strictly necessary when you save a file. This is a common feature in static site generators since it allows you to make small changes and see them immediately. This feature is especially important when

TODO

## Developing with Ryver

Ryver is based on plugins. In fact, Ryver itself is a small core, which deals almost exclusively with loading plugins and setting up -- as well as calling -- the hooks for those plugins.

Before getting into development, you should read Ryver's user guide and use Ryver at least for a little while, so that you are at least familiar with Ryver's "way" of doing things.

### Modules as plugins

TODO

### Life cycle of filtering: hooks and filters

TODO

### API

TODO

#### Functions signatures

TODO

#### Watching API

TODO

### Analisys of every plugin in Ryver

TODO

### Looking at existing plugins: techniques and tips

TODO

### An example plugin

TODO
