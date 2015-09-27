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

The Markdown processing obviously worked. You probably noticed that `_info.yaml` wasn't copied over: that is because _all files and directories starting with an underscore are ignored by the filters_.

The `markup-markdown` filter will make sure that any file with the extension `.md` will be processed as Markdown.

The `markup-markdown` filter is provided by the plugin `ryver-markup-markdown`, which will filter every file with extension `.md` into HTML, as well as renaming them to `.html`

What you learned in this chapter:

* `ryver src` is the same as `ryver src _site`: it will process all files in `src` recursively, and will use `_site` as output
* `ryver src src/_site` is allowed (files in `src/_site` will not be considered part of the input)
* Without any filtering instructions, files are simply copied over -- except the ones starting with `_` (underscore), which are ignored
* The file `_info.yaml` is important in Ryver since it tells Ryver how what to do with files in that directory _as well as any nested directory_.
* By having `filters: markup-markdown` in your `_info.yaml`, you are telling Ryver that any file with the extenion `.md` will need to be filtered as Markdown and renamed to `.html`.

## The frontmatter

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

## Liquid template and more variables

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

The `template-liquid` filter is provided by the plugin `ryver-template-liquid`. It may seem silly to add variables and then add them to the templates. However, their importance is more evident when you add more plugin to the mix, since plugins can (and will) create interesting (and useful!) variables.

What you learned in this chapter:

* You can enable the `template-liquid` filter by adding it to the `postProcessFilters` variable, enabling powerful templating based on variables.
* Variables in the frontmatter are accessible with in the `info.` namespace (or the `info` object)
* One of the things plugins do is provide extra variables for you to use

## Nested directories and variables

It's important now to take a deep breath and realise the power of Ryver and its variable system. When you have a `_info.yaml` file in a directory, the variables set there will be available to every filtered file in that directory, as well as _every filtered file in any nested directory_.

This means that for every directory you can have a "master" `_info.yaml` file, where you set variables to sane values, but then you can redifine _some_ (of all) of the values in sub-directories creating a `_info.yaml` file inside each one. And then, again, you can have files defining variables themselves using their own frontmatter.

This implies that you will want the _generic_ settings for variables in the site's "main" `_info.yaml` file, and then get more and more specific as you go deeper into the file system.

What you learned in this chapter:

* Variables set in `_info.yaml` files will influence variables for every filtered file in that directory and in any subsirectory. Frontmatter in files will also redefine variables on a per-file basis.

## Filtering lifecycle

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

## Ryver's `_config.yaml` file

Some of Ryver's plugins are configurable. If you place a file called `_config.yaml` in Ryver,


## Layout

TODO

## Pager

TODO

## Landing

TODO

## Lister

The most powerful plugin is Ryver is `lister`, which allows you to create a number of categories, and then "attach" any post to any categories amongst the available ones.

The most common example is the possibility of wanting `tags` and `category` for your posts. This means that a post could have something like this it its frontmatter:

---

---

## Ryver plugins

When you use Ryver, you are actually using it with

## Ryver watcher

TODO

## Ryver sites

These filters allow you to create powerful, unhackable static sites.

# Developing with Ryver

Ryver is based on plugins. In fact, Ryver itself is a small core, which deals almost exclusively with loading plugins and setting up -- as well as calling -- the hooks for those plugins.

Before getting into development, you should read Ryver's user guide and use Ryver at least for a little while, so that you are at least familiar with Ryver's "way" of doing things.

## Modules as plugins

## Life cycle of filtering: hooks and filters

## General structure of a plugin

## Looking at existing plugins: techniques and tips

## An example plugin




# Old blurb

A simple, filter-based static file generator with Node.js.
Mainly created out of my sheer desire of starting _and_ finishing something, after more that 3 years of developing [Hotplate](https://github.com/mercmobily/hotplate) -- as well as my need to convert several existing web sites to static ones.

Ryver is currently being documented. Also, unit-testing hasn't been done (yet)
