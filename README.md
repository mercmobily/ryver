# ryver

Ryver is the most powerful, extensible web site generator available. It's blazing fast, written in NodeJS, and using Yaml to configure how it works. You can use it to create powerful template-based static websites easily, and extend it adding simple hooks and filters.

## Install Ryver

To install Ryver, simply type:

    npm install ryver

And you should be good to go.

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

By running `ryver src` again, you will see that a new file, `hello_world.html`, was created and containe:

    <h1 id="hello-world-">Hello world!</h1>

The Markdown processing obviously worked. You probably noticed that `_info.yaml` wasn't copied over: that is because _all files and directories starting with an underscore are ignored by the filters_.

The `markup-markdown` filter will make sure that any file with the extension `.md` will be processed as Markdown.

The `markup-markdown` filter is provided by the plugin `ryver-markup-markdown`.

What you learned in this chapter:

* `ryver src` is the same as `ryver src _site`: it will process all files in `src` recursively, and will use `_site` as output
* `ryver src src/_site` is allowed (files in `src/_site` will not be considered part of the input)
* Without any filtering instructions, files are simply copied over -- except the ones starting with `_` (underscore), which are ignored
* The file `_info.yaml` is important in Ryver since it tells Ryver how what to do with files in that directory _as well as any nested directory_.
* By having `filters: markup-markdown` in your `_info.yaml`, you are telling Ryver that any file with the extenion `.md` will need to be filtered as Markdown

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

The `template-liquid` filter is provided by the plugin `ryver-template-liquid`. While it may seem silly to add variables and then add them to the templates. However, their importance is more evident when you have add more plugin to the mix, since plugins can create interesting (and useful!) variables.

What you learned in this chapter:

* You can enable the `template-liquid` filter by adding it to the `postProcessFilters` variable, enabling powerful templating based on variables.
* Variables in the frontmatter are accessible with in the `info.` namespace (or the `info` object)
* One of the things plugins do is provide extra variables for you to use

## Nested directories and variables

It's important now to take a deep breath and realise the power of Ryver and it's variable system.

# Filtering lifecycle



# Layout

TODO

# Paging

TODO

# Landing

TODO

# Lister

The most powerful plugin is Ryver is `lister`, which allows you to create a number of categories, and then "attach" any post to any categories amongst the available ones.

The most common example is the possibility of wanting `tags` and `category` for your posts. This means that a post could have something like this it its frontmatter:

---

---

## Ryver plugins

When you use Ryver, you are actually using it with

TODO

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
