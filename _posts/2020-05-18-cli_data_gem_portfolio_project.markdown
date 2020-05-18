---
layout: post
title:      "CLI Data Gem Portfolio Project"
date:       2020-05-18 04:41:45 +0000
permalink:  cli_data_gem_portfolio_project
---


*"Oh, what a feeling, I'm feeling life."*

Those infamous lyrics from the song Roc Boys by Jay Z perfectly encapsulated my mood(s) as I crossed the finish line. I experienced such a wide range of feelings during this project but nothing compared to seeing it work! I felt like Dr. Frankenstein as I glared proudly at my work. I felt nervous, lost, angry, stupid, helpless, hopeful and finally, I just felt very happy. 

This project was no joke, staring at an empty canvas and not knowing what code to even start with wasn't the biggest challenge starting off, it was coming up with a solid plan of what I wanted to do and sticking to it. I knew there were going to be times where I would want to scratch my plans and start over but I wanted to do everything I could in the beginning to avoid doing just that. I knew for this to work I needed a game plan and I needed to stick with it. 

So with that in mind, I wanted my project to be based on something I was knowledgeable in. I figured if I am not as knowledgeable in the code I wanted to write yet, I could at least be knowledgeable in the content that I would be presenting my user(s).......and thankfully I was thinking of all this while watching Michael Jordan's "The Last Dance" documentary because thats when the lightbulb went off. I love basketball, I'm knowledgeable in it and it's something that I enjoy and understand so I decided that I would build a Ruby Gem that would give you information about an NBA player. It sounded simple enough but little did I know.....


**Challenges**

Clearly there were a lot of challenges along the way but the first one was biting off more than I could chew. Initially I wanted my user to be able to get information on any NBA player but decided that picking one current team to scrape would be more feasible at this stage of my coding career. I have roots in Los Angeles and I love the Lakers so I decided I would scrape the Lakers roster and allow my user to get info on the current Lakers roster. 

The next challenge was finding a website that was scrap-able (shoutout to TheGignertonic). I figured I would start with the official Lakers website but there was way too much Javascript - It was probably scrap-able but not for me at the moment. So I searched and searched and finally found the LakersNation website that would work perfectly for me.

Next, I needed to figure out the flow of my program. This was an enjoyable challenge because I knew exactly what I wanted and I was able to stick with it. Here is the flow:

* User is welcomed
* User is shown the Laker Roster and all the info that would be provided for each player
* User is asked to pick a player
* User make a valid input and picks a player
* User is shown the information for the picked player
* User is given the option to pick another player or exit
* IF user exits, user is shown a goodbye message

Once I had most of my code and all of the info I wanted scraped, the most difficult challenge was figuring out how to puts out the data for a specific player. I had all the info I needed for the players but the problem was that regardless of which player the user picked, my CLI was puts-ing out all the info for all the players. And this is where I got stuck. After countless hours my problem would be solved with an IF statement. When I scraped the roster, I had the players name and the info for each player also included the player name SO - IF the player name the user picked matched with the player name for the info then show the data for that player. 

```
if row.css(".column-2").text == player.name 
          row.css("td").each_with_index do |data, i|
```

That line of code........."Oh, what a feeling, I'm feeling life."


**In Conclusion**

This project was no joke. It was challenging and super-stressful and I hope one day down the line I'll read this blog post and laught at myself for it but for now, I feel a little bit more confident and excited to continue my journey to become a Software Engineer. 











