---
layout: post
title:      "Sinatra works out and the home button that did not led Sinatra abyss."
date:       2020-07-23 23:14:59 -0400
permalink:  sinatra_works_out_and_the_home_button_that_did_not_led_sinatra_abyss
---



That was a long title but Sinatra has been fun to learn - the name itself had me excited to learn more about it. I learned that Sinatra is basically a gem, and a web framework that does some of the stuff under the hood so you can instead work on the higher level thing. The CRUD functionality, MVC structure and single responsibility were understandable. It just makes sense to stick to the conventions, as Sinatra likes.

For my Sinatra project Content Management System (CSM), I decided to build a workout tracker web application that will track workouts. This application will allow users to sign up or log in, once logged it gives them the ability to add a workout and perform the CRUD functionality on their account as well as the workouts. To start, I knew it was double the trouble, meaning I knew I needed at least 2 controllers, views and models. Once that was completed I began working on my controllers, which would be similar to each other because the functionalities are similar.

The challenge began when the mixture of HTML and ruby occurred. One of my biggest challenges was a button that I wanted to add which would direct the user to “/user/show”, the home page but I could not figure out what was broken.

`

href=”/users/<%=current_user.id%>”>My Account 
href=”/users/”#{current_user.id}”>My Account

` 
Do you see what the problem was? Good old, ERB tags.

Once I figured that out and issues with my controllers, I was pretty content with the project. It’s definitely not the prettiest but it works and looking back a few months from now when I barely knew anything about code - it’s not bad.

Thanks for reading.

-ON


