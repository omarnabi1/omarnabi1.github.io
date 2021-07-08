---
layout: post
title:      "Phase 4 - Javascript"
date:       2021-07-08 20:54:22 +0000
permalink:  phase_4_-_javascript
---


For my Javascript Project, I decided to develop a Note App, OmarsNotes. 

## OmarsNotes

This is a Single-Page-Application which allows users to create color-coordinated notes. User are also able to delete notes. 


### Models

I have 2 Models for this App, a **User Model** and a **Note Model**. 

Below is the *Entity Relationship Diagram* **User** has many **Notes** and/or **Notes** belong to a **User**. I created this diagram using Lucidchart. 

<a href="https://imgur.com/wK7gZHs"><img src="https://i.imgur.com/wK7gZHs.png" title="source: imgur.com" /></a>

### Classes

There are a total of 4 classes to encapsulate the date:

1. Class User
2. Class Notes
3. Class UserForm (Sign-In Form)
4. Class NoteEditor (Create Note Form)


### The App

##### Sign In
The user will land on a sign-in form, the sign-in portion is only meant to gather the users Name and Email so that the notes can be shared later on, no password is required. 

##### Create a Note
Once signed in, the user will see a note-form to create a new Note. The note cosnsits of a **Title**, **Body**, and **Status/Color**, and when filled, clicking *New Note* will submit the note-form using **POST** method and will have 2 promises that will eventually render the Note for the user on the screen. 





